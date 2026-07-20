import type { ActivityInput } from '../domain/activities/types'
import type { ChoreInput } from '../utils/choreModel'
import type { OfflineLocalStore } from '../shopping/shoppingIndexedDb'
import { CALENDAR_LOCAL_SCHEMA_VERSION, CALENDAR_PROVIDER_DOMAINS, calendarScopeKey, emptyCalendarData, type CalendarMutation, type CalendarProviderSnapshot, type CalendarRepositorySnapshot, type CalendarSnapshotData, type CalendarSnapshotDomain } from './calendarTypes'
import { applyPendingCalendarMutations, pendingCalendarRecords } from './calendarMutationQueue'
import { classifyCalendarSyncError, snapshotRange, SupabaseCalendarRemote, type CalendarRemote } from './calendarSync'

interface CalendarRepositoryOptions {
  familyId: string
  userId: string
  currentMemberId: string
  store: OfflineLocalStore
  remote?: CalendarRemote
  isOnline?: () => boolean
  now?: () => Date
  createId?: () => string
}

export class CalendarRepository {
  private readonly familyId: string
  private readonly userId: string
  private readonly currentMemberId: string
  private readonly scopeKey: string
  private readonly store: OfflineLocalStore
  private readonly remote: CalendarRemote
  private readonly isOnline: () => boolean
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly listeners = new Set<(snapshot: CalendarRepositorySnapshot) => void>()
  private serverData: CalendarSnapshotData = emptyCalendarData()
  private mutations: CalendarMutation[] = []
  private snapshot: CalendarRepositorySnapshot
  private localWrite: Promise<void> = Promise.resolve()
  private syncPromise: Promise<void> | null = null
  private startPromise: Promise<void> | null = null
  private readonly providerDomains = new Set<CalendarSnapshotDomain>()
  private deferredReconciliationTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private idleCallbackId: number | null = null
  private running = false
  private lifecycle = 0
  private retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private consecutiveSyncFailures = 0
  private remoteFallbackRequired = false
  private onlineListener = () => { void this.prioritizeReconciliation() }
  private offlineListener = () => this.publish('offline', null)
  private visibilityListener = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void this.prioritizeReconciliation() }

  constructor(options: CalendarRepositoryOptions) {
    this.familyId = options.familyId
    this.userId = options.userId
    this.currentMemberId = options.currentMemberId
    this.scopeKey = calendarScopeKey(options.userId, options.familyId)
    this.store = options.store
    this.remote = options.remote ?? new SupabaseCalendarRemote()
    this.isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine)
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.snapshot = {
      ready: false,
      hasUsableData: false,
      data: emptyCalendarData(),
      mutations: [],
      pendingByLocalId: new Map(),
      status: this.isOnline() ? 'syncing' : 'offline',
      lastSuccessfulSyncAt: null,
      error: null,
    }
  }

  getSnapshot() { return this.snapshot }

  subscribe(listener: (snapshot: CalendarRepositorySnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  start() {
    if (this.running) return this.startPromise ?? Promise.resolve()
    this.running = true
    const lifecycle = ++this.lifecycle
    const promise = this.startLifecycle(lifecycle)
    const tracked = promise.finally(() => {
      if (this.startPromise === tracked) this.startPromise = null
    })
    this.startPromise = tracked
    return tracked
  }

  private async startLifecycle(lifecycle: number) {
    const [stored, storedMutations] = await Promise.all([
      this.store.loadCalendarSnapshot(this.scopeKey),
      this.store.loadCalendarMutations(this.scopeKey),
    ])
    if (!this.isActive(lifecycle)) return
    this.serverData = stored?.data ?? emptyCalendarData()
    this.mutations = storedMutations.map((mutation) => mutation.status === 'syncing'
      ? { ...mutation, status: 'pending' as const, retryable: true }
      : mutation)
    this.replaceSnapshot({
      ready: true,
      hasUsableData: Boolean(stored?.hasSnapshot || this.mutations.length > 0),
      data: applyPendingCalendarMutations(this.serverData, this.mutations),
      mutations: [...this.mutations],
      pendingByLocalId: pendingCalendarRecords(this.mutations),
      status: this.isOnline() ? 'syncing' : 'offline',
      lastSuccessfulSyncAt: stored?.lastSuccessfulSyncAt ?? null,
      error: null,
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineListener)
      window.addEventListener('offline', this.offlineListener)
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityListener)
    if (stored || this.mutations.length > 0) await this.persistLocal()
    if (this.isOnline()) this.scheduleDeferredReconciliation()
  }

  async stop() {
    if (!this.running) return
    this.running = false
    this.lifecycle += 1
    if (this.retryTimer) globalThis.clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.cancelDeferredReconciliation()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener)
      window.removeEventListener('offline', this.offlineListener)
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityListener)
    await Promise.allSettled([this.syncPromise, this.localWrite])
  }

  async sync(options: { allowRemoteFallback?: boolean } = {}) {
    if (!this.running) return
    if (this.syncPromise) return this.syncPromise
    if (!this.isOnline()) {
      this.publish('offline', null)
      return
    }
    const lifecycle = this.lifecycle
    const promise = this.performSync(lifecycle, options.allowRemoteFallback === true)
    const tracked = promise.finally(() => {
      if (this.syncPromise === tracked) this.syncPromise = null
    })
    this.syncPromise = tracked
    return this.syncPromise
  }

  private async performSync(lifecycle: number, allowRemoteFallback: boolean) {
    this.publish('syncing', null)
    await this.waitForLocalWrites()
    if (!this.isActive(lifecycle)) return

    const successful = new Set<string>()
    if (allowRemoteFallback && !this.hasCompleteProviderSnapshot()) this.remoteFallbackRequired = true
    try {
      for (const queued of [...this.mutations]) {
        if (!this.isActive(lifecycle)) return
        const current = this.mutations.find((mutation) => mutation.operationId === queued.operationId)
        if (!current || current.status === 'failed' && !current.retryable) continue
        this.replaceMutation({ ...current, status: 'syncing', error: null })
        await this.persistLocal()
        try {
          await this.remote.applyMutation(current)
          successful.add(current.operationId)
        } catch (error) {
          const failure = classifyCalendarSyncError(error)
          this.replaceMutation({
            ...current,
            status: failure.retryable ? 'pending' : 'failed',
            retryable: failure.retryable,
            attempts: current.attempts + 1,
            error: failure.message,
          })
          await this.persistLocal()
          if (failure.retryable) throw error
        }
      }

      const needsRemoteSnapshot = successful.size > 0 || (this.remoteFallbackRequired && !this.hasCompleteProviderSnapshot())
      if (needsRemoteSnapshot) {
        const fresh = await this.remote.fetchSnapshot(this.familyId)
        if (!this.isActive(lifecycle)) return
        this.serverData = fresh
        CALENDAR_PROVIDER_DOMAINS.forEach((domain) => this.providerDomains.add(domain))
        this.remoteFallbackRequired = false
      }
      this.consecutiveSyncFailures = 0
      this.mutations = this.mutations.filter((mutation) => !successful.has(mutation.operationId))
      const reconciled = this.hasCompleteProviderSnapshot()
      const lastSuccessfulSyncAt = reconciled ? this.now().toISOString() : this.snapshot.lastSuccessfulSyncAt
      await this.persistLocal(lastSuccessfulSyncAt)
      const hasFailed = this.mutations.some((mutation) => mutation.status === 'failed')
      this.replaceSnapshot(this.buildSnapshot({
        status: hasFailed ? 'error' : this.mutations.length > 0 || !reconciled ? 'syncing' : 'synced',
        lastSuccessfulSyncAt,
        error: hasFailed ? 'calendar-mutation-failed' : null,
      }))
      if (this.mutations.some((mutation) => mutation.status === 'pending' && mutation.retryable)) this.scheduleRetry()
    } catch (error) {
      if (!this.isActive(lifecycle)) return
      this.mutations = this.mutations.map((mutation) => mutation.status === 'syncing'
        ? { ...mutation, status: 'pending' as const, retryable: true }
        : mutation)
      this.consecutiveSyncFailures += 1
      await this.persistLocal().catch((persistenceError) => {
        console.error('Failed to preserve the calendar mutation queue:', persistenceError)
      })
      this.replaceSnapshot(this.buildSnapshot({
        status: this.isOnline() ? 'error' : 'offline',
        error: classifyCalendarSyncError(error).message,
      }))
      if (this.isOnline()) this.scheduleRetry()
    }
  }

  updateFromProviders(familyId: string, update: CalendarProviderSnapshot) {
    if (!this.running || familyId !== this.familyId) return false
    const domains = Object.keys(update) as CalendarSnapshotDomain[]
    if (domains.length === 0) return false
    const range = snapshotRange(this.now())
    this.serverData = { ...this.serverData, ...update, rangeStart: range.start, rangeEnd: range.end }
    domains.forEach((domain) => this.providerDomains.add(domain))
    const complete = this.hasCompleteProviderSnapshot()
    const lastSuccessfulSyncAt = complete ? this.now().toISOString() : this.snapshot.lastSuccessfulSyncAt
    if (complete) {
      this.remoteFallbackRequired = false
      this.cancelDeferredReconciliation()
    }
    const hasFailedMutation = this.mutations.some((mutation) => mutation.status === 'failed')
    this.replaceSnapshot(this.buildSnapshot({
      status: !this.isOnline()
        ? 'offline'
        : hasFailedMutation
          ? 'error'
          : this.mutations.length > 0
            ? 'syncing'
            : complete
              ? 'synced'
              : this.snapshot.status,
      lastSuccessfulSyncAt,
      error: hasFailedMutation ? this.snapshot.error ?? 'calendar-mutation-failed' : null,
    }))
    void this.persistLocal(lastSuccessfulSyncAt).catch((error) => {
      console.error('Failed to persist provider-backed calendar snapshot:', error)
    })
    return true
  }

  async prioritizeReconciliation() {
    if (!this.running || !this.isOnline()) return
    this.cancelDeferredReconciliation()
    await this.sync({ allowRemoteFallback: true })
  }

  async addChore(input: ChoreInput) {
    await this.startPromise
    const mutation = this.newMutation('create_chore', input)
    await this.commit(mutation)
    return mutation.localId
  }

  async addActivity(input: ActivityInput) {
    await this.startPromise
    const mutation = this.newMutation('create_activity', input)
    await this.commit(mutation)
    return mutation.localId
  }

  async updatePending(localId: string, input: ChoreInput | ActivityInput) {
    await this.startPromise
    const current = this.mutations.find((mutation) => mutation.localId === localId)
    if (!current) throw new Error('Pending calendar record not found')
    const next = { ...current, payload: input, status: 'pending' as const, retryable: true, error: null } as CalendarMutation
    this.replaceMutation(next)
    this.replaceSnapshot(this.buildSnapshot({ status: this.isOnline() ? 'syncing' : 'offline', error: null }))
    await this.persistLocal()
    if (this.isOnline()) queueMicrotask(() => { void this.sync() })
  }

  async retry(localId?: string) {
    await this.startPromise
    this.mutations = this.mutations.map((mutation) => !localId || mutation.localId === localId
      ? { ...mutation, status: 'pending' as const, retryable: true, error: null }
      : mutation)
    this.replaceSnapshot(this.buildSnapshot({ status: this.isOnline() ? 'syncing' : 'offline', error: null }))
    await this.persistLocal()
    await this.sync()
  }

  async discard(localId: string) {
    await this.startPromise
    this.mutations = this.mutations.filter((mutation) => mutation.localId !== localId)
    this.replaceSnapshot(this.buildSnapshot({
      status: this.isOnline() ? this.mutations.length > 0 ? 'syncing' : 'synced' : 'offline',
      error: null,
    }))
    await this.persistLocal()
  }

  private newMutation<T extends 'create_chore' | 'create_activity'>(type: T, payload: T extends 'create_chore' ? ChoreInput : ActivityInput): CalendarMutation {
    const createdAt = this.now().toISOString()
    return {
      operationId: this.createId(),
      scopeKey: this.scopeKey,
      userId: this.userId,
      familyId: this.familyId,
      currentMemberId: this.currentMemberId,
      localId: this.createId(),
      type,
      payload,
      createdAt,
      attempts: 0,
      status: 'pending',
      retryable: true,
      error: null,
    } as CalendarMutation
  }

  private async commit(mutation: CalendarMutation) {
    this.mutations = [...this.mutations, mutation]
    this.replaceSnapshot(this.buildSnapshot({ status: this.isOnline() ? 'syncing' : 'offline', error: null }))
    await this.persistLocal()
    if (this.isOnline()) queueMicrotask(() => { void this.sync() })
  }

  private replaceMutation(next: CalendarMutation) {
    this.mutations = this.mutations.map((mutation) => mutation.operationId === next.operationId ? next : mutation)
  }

  private buildSnapshot(overrides: Partial<Pick<CalendarRepositorySnapshot, 'status' | 'lastSuccessfulSyncAt' | 'error'>> = {}): CalendarRepositorySnapshot {
    return {
      ...this.snapshot,
      ready: true,
      hasUsableData: this.snapshot.hasUsableData || this.serverData.rangeStart !== '' || this.mutations.length > 0,
      data: applyPendingCalendarMutations(this.serverData, this.mutations),
      mutations: [...this.mutations],
      pendingByLocalId: pendingCalendarRecords(this.mutations),
      ...overrides,
    }
  }

  private publish(status: CalendarRepositorySnapshot['status'], error: string | null) {
    this.replaceSnapshot(this.buildSnapshot({ status, error }))
  }

  private persistLocal(lastSuccessfulSyncAt = this.snapshot.lastSuccessfulSyncAt) {
    const data = structuredClone(this.serverData)
    const mutations = structuredClone(this.mutations)
    this.localWrite = this.localWrite.catch(() => undefined).then(async () => {
      await Promise.all([
        this.store.saveCalendarSnapshot({
          scopeKey: this.scopeKey,
          userId: this.userId,
          familyId: this.familyId,
          schemaVersion: CALENDAR_LOCAL_SCHEMA_VERSION,
          hasSnapshot: data.rangeStart !== '',
          data,
          lastSuccessfulSyncAt,
        }),
        this.store.replaceCalendarMutations(this.scopeKey, mutations),
      ])
    })
    return this.localWrite
  }

  private async waitForLocalWrites() {
    while (true) {
      const pending = this.localWrite
      await pending
      if (pending === this.localWrite) return
    }
  }

  private scheduleRetry() {
    if (this.retryTimer || !this.running) return
    const attempts = Math.max(1, this.consecutiveSyncFailures, ...this.mutations.filter((mutation) => mutation.retryable).map((mutation) => mutation.attempts))
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6))
    this.retryTimer = globalThis.setTimeout(() => {
      this.retryTimer = null
      void this.sync()
    }, delay)
  }

  private hasCompleteProviderSnapshot() {
    return CALENDAR_PROVIDER_DOMAINS.every((domain) => this.providerDomains.has(domain))
  }

  private scheduleDeferredReconciliation() {
    this.cancelDeferredReconciliation()
    const reconcile = () => {
      this.cancelDeferredReconciliation()
      if (!this.hasCompleteProviderSnapshot()) void this.sync({ allowRemoteFallback: true })
    }
    this.deferredReconciliationTimer = globalThis.setTimeout(reconcile, 4_000)
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      this.idleCallbackId = window.requestIdleCallback(reconcile, { timeout: 4_000 })
    }
  }

  private cancelDeferredReconciliation() {
    if (this.deferredReconciliationTimer) globalThis.clearTimeout(this.deferredReconciliationTimer)
    this.deferredReconciliationTimer = null
    if (this.idleCallbackId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(this.idleCallbackId)
    }
    this.idleCallbackId = null
  }

  private isActive(lifecycle: number) { return this.running && lifecycle === this.lifecycle }

  private replaceSnapshot(snapshot: CalendarRepositorySnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener(snapshot)
  }
}

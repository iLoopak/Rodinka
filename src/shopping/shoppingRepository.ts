import {
  buildCommonShoppingTemplates,
  findMergeCandidate,
  mergeCompatibleQuantity,
  normalizeShoppingName,
  type ShoppingAddResult,
  type ShoppingBatchResult,
  type ShoppingCategory,
  type ShoppingItem,
  type ShoppingItemInput,
} from '../utils/shopping'
import type { ShoppingLocalStore, ShoppingScope } from './shoppingIndexedDb'
import {
  applyShoppingMutation,
  applyPendingShoppingMutations,
  enqueueShoppingMutation,
  failedShoppingMutations,
  newShoppingMutationState,
  pendingShoppingItemIds,
  pendingShoppingMutationCount,
  resumeInterruptedShoppingMutations,
  syncableShoppingMutations,
  type ShoppingMutation,
  type ShoppingMutationType,
} from './shoppingMutationQueue'
import { subscribeToShoppingRealtime, type ShoppingRealtimeSubscription } from './shoppingRealtime'
import { SupabaseShoppingRemote, type ShoppingRemote } from './shoppingSync'
import { classifyAppError, isRetryableErrorCode, type AppErrorCode } from '../errors/errorCodes'

export type ShoppingSyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

export interface ShoppingRepositorySnapshot {
  ready: boolean
  hasUsableData: boolean
  items: ShoppingItem[]
  pendingItemIds: Set<string>
  /** Mutations still worth sending; excludes ones parked on a hard failure. */
  pendingCount: number
  /** Mutations the server rejected permanently, awaiting retry or discard. */
  failedMutations: ShoppingMutation[]
  status: ShoppingSyncStatus
  lastSuccessfulSyncAt: string | null
  /** A semantic code, never a raw Supabase message (audit section 9). */
  error: AppErrorCode | null
}

interface ShoppingRepositoryOptions {
  familyId: string
  userId: string
  currentMemberId: string
  store: ShoppingLocalStore
  remote?: ShoppingRemote
  realtime?: ShoppingRealtimeSubscription
  isOnline?: () => boolean
  now?: () => Date
  createId?: () => string
}

export class ShoppingRepository {
  private readonly familyId: string
  private readonly scope: ShoppingScope
  private readonly currentMemberId: string
  private readonly store: ShoppingLocalStore
  private readonly remote: ShoppingRemote
  private readonly realtime: ShoppingRealtimeSubscription
  private readonly isOnline: () => boolean
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly listeners = new Set<(snapshot: ShoppingRepositorySnapshot) => void>()
  private snapshot: ShoppingRepositorySnapshot
  private mutations: ShoppingMutation[] = []
  private inFlightMutations: ShoppingMutation[] = []
  private localWrite: Promise<void> = Promise.resolve()
  private syncPromise: Promise<void> | null = null
  private stopRealtime: (() => Promise<void>) | null = null
  private running = false
  private lifecycle = 0
  private startPromise: Promise<void> | null = null
  private stopPromise: Promise<void> = Promise.resolve()
  private realtimeHealthy = false
  private retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private consecutiveSyncFailures = 0
  private onlineListener = () => { void this.sync() }
  private visibilityListener = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void this.sync() }

  constructor(options: ShoppingRepositoryOptions) {
    this.familyId = options.familyId
    this.scope = { userId: options.userId, familyId: options.familyId }
    this.currentMemberId = options.currentMemberId
    this.store = options.store
    this.remote = options.remote ?? new SupabaseShoppingRemote()
    this.realtime = options.realtime ?? subscribeToShoppingRealtime
    this.isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine)
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.snapshot = {
      ready: false,
      hasUsableData: false,
      items: [],
      pendingItemIds: new Set(),
      pendingCount: 0,
      failedMutations: [],
      status: this.isOnline() ? 'synced' : 'offline',
      lastSuccessfulSyncAt: null,
      error: null,
    }
  }

  getSnapshot() { return this.snapshot }

  subscribe(listener: (snapshot: ShoppingRepositorySnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  start() {
    if (this.running) return this.startPromise ?? Promise.resolve()
    this.running = true
    const lifecycle = ++this.lifecycle
    const startPromise = this.startLifecycle(lifecycle)
    this.startPromise = startPromise.finally(() => {
      if (this.startPromise === startPromise) this.startPromise = null
    })
    return this.startPromise
  }

  private async startLifecycle(lifecycle: number) {
    const [items, mutations, metadata] = await Promise.all([
      this.store.loadItems(this.scope),
      this.store.loadMutations(this.scope),
      this.store.loadMetadata(this.scope),
    ])
    if (!this.isActive(lifecycle)) return
    this.mutations = resumeInterruptedShoppingMutations(mutations)
    const failed = failedShoppingMutations(this.mutations)
    this.replaceSnapshot({
      ready: true,
      hasUsableData: Boolean(metadata?.hasSnapshot || items.length > 0 || mutations.length > 0),
      items,
      pendingItemIds: pendingShoppingItemIds(this.mutations),
      pendingCount: pendingShoppingMutationCount(this.mutations),
      failedMutations: failed,
      status: failed.length > 0 ? 'error' : this.isOnline() ? 'syncing' : 'offline',
      lastSuccessfulSyncAt: metadata?.lastSuccessfulSyncAt ?? null,
      error: failed[0]?.error ?? null,
    })
    await this.ensureRealtime(lifecycle)
    if (!this.isActive(lifecycle)) return
    if (typeof window !== 'undefined') window.addEventListener('online', this.onlineListener)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityListener)
    await this.sync()
  }

  stop() {
    if (!this.running && !this.stopRealtime) return this.stopPromise
    this.running = false
    this.lifecycle += 1
    if (this.retryTimer) globalThis.clearTimeout(this.retryTimer)
    this.retryTimer = null
    const stopRealtime = this.stopRealtime
    this.stopRealtime = null
    this.realtimeHealthy = false
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onlineListener)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityListener)
    this.stopPromise = this.stopPromise.then(() => stopRealtime?.()).then(() => undefined)
    return this.stopPromise
  }

  async sync() {
    if (!this.running) return
    if (this.syncPromise) return this.syncPromise
    if (!this.isOnline()) {
      this.replaceSnapshot({ ...this.snapshot, status: 'offline', error: null })
      return
    }
    const lifecycle = this.lifecycle
    this.syncPromise = this.performSync(lifecycle).then((syncAgain) => {
      this.syncPromise = null
      if (syncAgain && this.isOnline() && this.isActive(lifecycle)) this.scheduleSync()
    })
    return this.syncPromise
  }

  private async performSync(lifecycle: number) {
    this.replaceSnapshot({ ...this.snapshot, status: 'syncing', error: null })
    await this.ensureRealtime(lifecycle)
    if (!this.isActive(lifecycle)) return false
    await this.waitForLocalWrites()
    if (!this.isActive(lifecycle)) return false

    // Per-mutation rather than one all-or-nothing batch. The old shape put
    // every mutation back in the queue when any one of them failed, so a
    // permanently invalid mutation kept the whole list in `error` forever and
    // there was no way to see which one, retry it, or throw it away.
    const uploading = syncableShoppingMutations(this.mutations)
    const succeeded = new Set<string>()
    let transportFailure: unknown = null

    for (const queued of uploading) {
      if (!this.isActive(lifecycle)) return false
      const current = this.mutations.find((mutation) => mutation.mutationId === queued.mutationId)
      if (!current) continue
      this.replaceMutation({ ...current, status: 'syncing', error: null })
      this.inFlightMutations = [current]
      await this.persistLocal(this.snapshot.items)
      try {
        await this.remote.applyMutation(current)
        succeeded.add(current.mutationId)
      } catch (error) {
        const code = classifyAppError(error, { browserOnline: this.isOnline() })
        const retryable = isRetryableErrorCode(code)
        this.replaceMutation({
          ...current,
          status: retryable ? 'pending' : 'failed',
          retryable,
          attempts: current.attempts + 1,
          error: code,
        })
        // A transport problem means the rest of the queue will fail the same
        // way; stop and let backoff retry. A rejected mutation is specific to
        // that mutation, so the queue behind it still gets its turn.
        if (retryable) { transportFailure = error; break }
      }
      this.inFlightMutations = []
    }
    this.inFlightMutations = []
    if (!this.isActive(lifecycle)) return false

    this.mutations = this.mutations.filter((mutation) => !succeeded.has(mutation.mutationId))

    if (transportFailure) {
      try { await this.persistLocal(this.snapshot.items) }
      catch (persistenceError) { console.error('Failed to preserve the shopping mutation queue:', persistenceError) }
      this.publishQueueState({
        items: this.snapshot.items,
        status: this.isOnline() ? 'error' : 'offline',
        error: classifyAppError(transportFailure, { browserOnline: this.isOnline() }),
      })
      if (this.isOnline()) this.scheduleRetry()
      return false
    }

    try {
      const items = applyPendingShoppingMutations(await this.remote.fetchItems(this.familyId), this.mutations)
      if (!this.isActive(lifecycle)) return false
      const lastSuccessfulSyncAt = this.now().toISOString()
      this.consecutiveSyncFailures = 0
      await this.persistLocal(items, lastSuccessfulSyncAt)
      const failed = failedShoppingMutations(this.mutations)
      const pending = pendingShoppingMutationCount(this.mutations)
      this.replaceSnapshot({
        ready: true,
        hasUsableData: true,
        items,
        pendingItemIds: pendingShoppingItemIds(this.mutations),
        pendingCount: pending,
        failedMutations: failed,
        status: failed.length > 0 || !this.realtimeHealthy ? 'error' : pending > 0 ? 'syncing' : 'synced',
        lastSuccessfulSyncAt,
        error: failed[0]?.error ?? (this.realtimeHealthy ? null : 'realtime-disconnected'),
      })
      return pending > 0
    } catch (error) {
      if (!this.isActive(lifecycle)) return false
      try { await this.persistLocal(this.snapshot.items) }
      catch (persistenceError) { console.error('Failed to preserve the shopping mutation queue:', persistenceError) }
      this.publishQueueState({
        items: this.snapshot.items,
        status: this.isOnline() ? 'error' : 'offline',
        error: classifyAppError(error, { browserOnline: this.isOnline() }),
      })
      if (this.isOnline()) this.scheduleRetry()
      return false
    }
  }

  /**
   * Puts a mutation back in line after the user corrected or acknowledged it.
   * Without an itemId this retries everything that is parked.
   */
  async retryFailed(itemId?: string) {
    await this.startPromise
    this.mutations = this.mutations.map((mutation) => !itemId || mutation.itemId === itemId
      ? { ...mutation, ...newShoppingMutationState() }
      : mutation)
    this.publishQueueState({ items: this.snapshot.items, status: this.isOnline() ? 'syncing' : 'offline', error: null })
    await this.persistLocal(this.snapshot.items)
    await this.sync()
  }

  /**
   * Drops a mutation the user has given up on, and rolls its optimistic effect
   * off the local list so the screen stops showing a change that will never land.
   */
  async discardFailed(itemId: string) {
    await this.startPromise
    const discarded = this.mutations.filter((mutation) => mutation.itemId === itemId)
    this.mutations = this.mutations.filter((mutation) => mutation.itemId !== itemId)

    // Only a rejected `create` means the row exists nowhere but here, so only
    // then is dropping it correct. Discarding a rejected update or delete
    // leaves a row the server still owns: removing it would hide an item that
    // is really there. Those reconcile from the server on the next sync.
    const wasLocalOnlyCreate = discarded.some((mutation) => mutation.type === 'create')
    const base = wasLocalOnlyCreate
      ? this.snapshot.items.filter((item) => item.id !== itemId)
      : this.snapshot.items
    const items = applyPendingShoppingMutations(base, this.mutations)

    const remaining = pendingShoppingMutationCount(this.mutations)
    const needsReconcile = !wasLocalOnlyCreate && this.isOnline()
    this.publishQueueState({
      items,
      status: !this.isOnline() ? 'offline' : remaining > 0 || needsReconcile ? 'syncing' : 'synced',
      error: null,
    })
    await this.persistLocal(items)
    if (this.isOnline() && (remaining > 0 || needsReconcile)) this.scheduleSync()
  }

  private replaceMutation(next: ShoppingMutation) {
    this.mutations = this.mutations.map((mutation) => mutation.mutationId === next.mutationId ? next : mutation)
  }

  /** Recomputes the queue-derived half of the snapshot from `this.mutations`. */
  private publishQueueState(input: { items: ShoppingItem[]; status: ShoppingSyncStatus; error: AppErrorCode | null }) {
    const failed = failedShoppingMutations(this.mutations)
    this.replaceSnapshot({
      ...this.snapshot,
      ready: true,
      items: input.items,
      pendingItemIds: pendingShoppingItemIds([...this.inFlightMutations, ...this.mutations]),
      pendingCount: pendingShoppingMutationCount(this.mutations),
      failedMutations: failed,
      status: failed.length > 0 && input.status === 'synced' ? 'error' : input.status,
      error: input.error ?? failed[0]?.error ?? null,
    })
  }

  private scheduleRetry() {
    if (this.retryTimer || !this.running) return
    const attempts = Math.max(
      1,
      this.consecutiveSyncFailures,
      ...this.mutations.filter((mutation) => mutation.retryable).map((mutation) => mutation.attempts),
    )
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6))
    this.consecutiveSyncFailures += 1
    this.retryTimer = globalThis.setTimeout(() => {
      this.retryTimer = null
      void this.sync()
    }, delay)
  }

  async addItem(input: ShoppingItemInput, forceSeparate = false, source?: { mealId?: string | null; planEntryId?: string | null }): Promise<ShoppingAddResult> {
    const candidate = forceSeparate ? null : findMergeCandidate(this.snapshot.items, input)
    if (candidate) {
      const quantity = mergeCompatibleQuantity(candidate, input)
      if (quantity !== null) {
        await this.updateItem(candidate.id, { ...input, quantity })
        return { action: 'merged', item: this.snapshot.items.find((item) => item.id === candidate.id)! }
      }
      if (candidate.quantity === null && input.quantity === null) return { action: 'existing', item: candidate }
    }

    const timestamp = this.now().toISOString()
    const item: ShoppingItem = {
      id: this.createId(),
      family_id: this.familyId,
      name: input.name.trim(),
      normalized_name: normalizeShoppingName(input.name),
      quantity: input.quantity,
      unit: input.unit,
      note: input.note.trim() || null,
      category: input.category,
      created_by_member_id: this.currentMemberId,
      responsible_member_id: input.responsibleMemberId,
      purchased: false,
      purchased_by_member_id: null,
      purchased_at: null,
      archived_at: null,
      sort_order: 0,
      source_meal_id: source?.mealId ?? null,
      source_meal_plan_entry_id: source?.planEntryId ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    }
    await this.commit(this.mutation('create', item.id, { item }))
    return { action: 'added', item }
  }

  async updateItem(id: string, input: ShoppingItemInput) {
    await this.commit(this.mutation('update', id, {
      name: input.name.trim(),
      normalized_name: normalizeShoppingName(input.name),
      quantity: input.quantity,
      unit: input.unit,
      note: input.note.trim() || null,
      category: input.category,
      responsible_member_id: input.responsibleMemberId,
    }))
  }

  async deleteItem(id: string) { await this.commit(this.mutation('delete', id, {})) }

  async togglePurchased(id: string, purchased: boolean) {
    const timestamp = this.now().toISOString()
    await this.commit(this.mutation('toggle', id, {
      purchased,
      purchasedAt: purchased ? timestamp : null,
      purchasedByMemberId: purchased ? this.currentMemberId : null,
    }, timestamp))
  }

  async reorderItem(movedItemId: string, targetCategory: ShoppingCategory, orderedTargetIds: string[]) {
    await this.commit(this.mutation('reorder', movedItemId, { targetCategory, orderedTargetIds }))
  }

  async archivePurchased() {
    const timestamp = this.now().toISOString()
    const purchased = this.snapshot.items.filter((item) => item.purchased && item.archived_at === null)
    for (const item of purchased) await this.commit(this.mutation('update', item.id, { archived_at: timestamp }, timestamp), false)
    this.scheduleSync()
  }

  async importItems(inputs: ShoppingItemInput[], source?: { mealId?: string | null; planEntryId?: string | null }): Promise<ShoppingBatchResult> {
    const result: ShoppingBatchResult = { added: 0, merged: 0, skipped: 0, failed: 0 }
    for (const input of inputs) {
      try {
        const added = await this.addItem(input, false, source)
        if (added.action === 'added') result.added += 1
        else if (added.action === 'merged') result.merged += 1
        else result.skipped += 1
      } catch { result.failed += 1 }
    }
    return result
  }

  private mutation(type: ShoppingMutationType, itemId: string, payload: Record<string, unknown>, createdAt = this.now().toISOString()): ShoppingMutation {
    return { mutationId: this.createId(), familyId: this.familyId, type, itemId, payload, createdAt, ...newShoppingMutationState() }
  }

  private async commit(mutation: ShoppingMutation, sync = true) {
    this.mutations = enqueueShoppingMutation(this.mutations, mutation)
    const items = applyShoppingMutation(this.snapshot.items, mutation)
    this.replaceSnapshot({
      ...this.snapshot,
      ready: true,
      items,
      pendingItemIds: pendingShoppingItemIds([...this.inFlightMutations, ...this.mutations]),
      pendingCount: pendingShoppingMutationCount(this.mutations),
      failedMutations: failedShoppingMutations(this.mutations),
      status: this.isOnline() ? this.snapshot.status : 'offline',
      error: null,
    })
    await this.persistLocal(items)
    if (sync) this.scheduleSync()
  }

  private persistLocal(items: ShoppingItem[], lastSuccessfulSyncAt = this.snapshot.lastSuccessfulSyncAt) {
    const mutations = [...this.inFlightMutations, ...this.mutations]
    const templates = buildCommonShoppingTemplates(items, items.filter((item) => !item.purchased && item.archived_at === null))
    this.localWrite = this.localWrite.catch(() => undefined).then(async () => {
      await Promise.all([
        this.store.replaceItems(this.scope, items),
        this.store.replaceMutations(this.scope, mutations),
        this.store.saveTemplates(this.scope, templates),
        this.store.saveMetadata(this.scope, { familyId: this.familyId, hasSnapshot: true, lastSuccessfulSyncAt }),
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

  private scheduleSync() { if (this.isOnline()) queueMicrotask(() => { void this.sync() }) }

  private isActive(lifecycle: number) { return this.running && lifecycle === this.lifecycle }

  private async ensureRealtime(lifecycle: number) {
    if (this.stopRealtime || !this.isActive(lifecycle)) return
    try {
      await this.stopPromise
      if (!this.isActive(lifecycle)) return
      const stop = await this.realtime(this.familyId, () => {
        if (this.isActive(lifecycle)) void this.sync()
      })
      if (!this.isActive(lifecycle)) {
        await stop()
        return
      }
      this.stopRealtime = stop
      this.realtimeHealthy = true
    } catch (error) {
      this.realtimeHealthy = false
      console.error('Shopping Realtime subscription failed:', error)
    }
  }

  private replaceSnapshot(snapshot: ShoppingRepositorySnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener(snapshot)
  }
}

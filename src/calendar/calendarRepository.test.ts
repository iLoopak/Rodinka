import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityInput } from '../domain/activities/types'
import { MemoryShoppingStore } from '../shopping/shoppingIndexedDb'
import { applyPendingCalendarMutations } from './calendarMutationQueue'
import { CalendarRepository } from './calendarRepository'
import { CALENDAR_LOCAL_SCHEMA_VERSION, emptyCalendarData, type CalendarMutation, type CalendarProviderSnapshot, type CalendarSnapshotData } from './calendarTypes'
import type { CalendarRemote } from './calendarSync'

const activityInput: ActivityInput = {
  title: 'Swimming',
  category: 'swimming',
  kind: 'club',
  allDay: false,
  participantIds: ['member-2'],
  responsibleMemberId: 'member-1',
  secondaryResponsibleMemberId: null,
  location: 'Pool',
  coachName: '',
  coachPhone: '',
  coachEmail: '',
  notes: 'Bring goggles',
  skillLevel: '',
  startDate: '2026-07-20',
  endDate: null,
  recurrenceType: 'weekly',
  recurrenceWeekdays: null,
  startTime: '16:00',
  endTime: '17:00',
  paymentAmount: null,
  paymentFrequency: null,
  nextPaymentDueDate: null,
  status: 'active',
  reminderEnabled: false,
  reminderDaysBefore: null,
}

function serverData(): CalendarSnapshotData {
  return { ...emptyCalendarData(), rangeStart: '2026-01-01', rangeEnd: '2027-07-31' }
}

class FakeRemote implements CalendarRemote {
  data = serverData()
  operationIds = new Set<string>()
  calls = 0
  fetchCalls = 0
  fetchFailures = 0
  failAfterCommit = false
  permanentFailure = false

  async applyMutation(mutation: CalendarMutation) {
    this.calls += 1
    if (this.permanentFailure) throw { code: '23514', message: 'invalid calendar payload' }
    if (!this.operationIds.has(mutation.operationId)) {
      this.operationIds.add(mutation.operationId)
      this.data = applyPendingCalendarMutations(this.data, [mutation])
    }
    if (this.failAfterCommit) throw new TypeError('connection lost after commit')
  }

  async fetchSnapshot() {
    this.fetchCalls += 1
    if (this.fetchFailures > 0) { this.fetchFailures -= 1; throw new TypeError('snapshot unavailable') }
    return structuredClone(this.data)
  }
}

function repository(input: {
  store: MemoryShoppingStore
  remote: FakeRemote
  isOnline: () => boolean
  userId?: string
}) {
  let sequence = 0
  return new CalendarRepository({
    familyId: 'family-1',
    userId: input.userId ?? 'user-1',
    currentMemberId: 'member-1',
    store: input.store,
    remote: input.remote,
    isOnline: input.isOnline,
    createId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => new Date('2026-07-18T20:00:00Z'),
  })
}

function providerSnapshot(): CalendarProviderSnapshot {
  const { rangeStart: _rangeStart, rangeEnd: _rangeEnd, ...domains } = serverData()
  return domains
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('offline calendar repository', () => {
  it('publishes a stored snapshot before deferred online reconciliation starts', async () => {
    vi.useFakeTimers()
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const stored = serverData()
    stored.chores = [{ id: 'stored-chore' } as CalendarSnapshotData['chores'][number]]
    await store.saveCalendarSnapshot({
      scopeKey: 'user-1:family-1', userId: 'user-1', familyId: 'family-1',
      schemaVersion: CALENDAR_LOCAL_SCHEMA_VERSION, hasSnapshot: true, data: stored,
      lastSuccessfulSyncAt: '2026-07-18T10:00:00Z',
    })
    const calendar = repository({ store, remote, isOnline: () => true })

    await calendar.start()

    expect(calendar.getSnapshot()).toMatchObject({ ready: true, hasUsableData: true })
    expect(calendar.getSnapshot().data.chores[0].id).toBe('stored-chore')
    expect(remote.fetchCalls).toBe(0)
    await calendar.stop()
  })

  it('uses provider domains for reconciliation and cancels the remote fallback', async () => {
    vi.useFakeTimers()
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => true })
    await calendar.start()

    expect(calendar.updateFromProviders('other-family', providerSnapshot())).toBe(false)
    expect(calendar.updateFromProviders('family-1', providerSnapshot())).toBe(true)
    expect(calendar.getSnapshot()).toMatchObject({ status: 'synced', hasUsableData: true })
    await vi.advanceTimersByTimeAsync(4_000)
    expect(remote.fetchCalls).toBe(0)
    await calendar.stop()
  })

  it('falls back to one deferred remote reconciliation when provider data stays incomplete', async () => {
    vi.useFakeTimers()
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => true })
    await calendar.start()
    expect(remote.fetchCalls).toBe(0)

    await vi.advanceTimersByTimeAsync(3_999)
    expect(remote.fetchCalls).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(remote.fetchCalls).toBe(1)
    await calendar.stop()
  })

  it('reconciles when the browser becomes idle before the timeout fallback', async () => {
    vi.useFakeTimers()
    let idleCallback: IdleRequestCallback | null = null
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback
        return 1
      }),
      cancelIdleCallback: vi.fn(),
    })
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => true })
    await calendar.start()
    expect(remote.fetchCalls).toBe(0)

    expect(idleCallback).not.toBeNull()
    idleCallback!({ didTimeout: false, timeRemaining: () => 50 })
    await vi.advanceTimersByTimeAsync(0)

    expect(remote.fetchCalls).toBe(1)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(remote.fetchCalls).toBe(1)
    await calendar.stop()
  })

  it('lets a Calendar route prioritize reconciliation without leaving a second fallback', async () => {
    vi.useFakeTimers()
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => true })
    await calendar.start()

    await calendar.prioritizeReconciliation()
    expect(remote.fetchCalls).toBe(1)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(remote.fetchCalls).toBe(1)
    await calendar.stop()
  })

  it('retains deferred fallback intent across a retryable backend failure', async () => {
    vi.useFakeTimers()
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    remote.fetchFailures = 1
    const calendar = repository({ store, remote, isOnline: () => true })
    await calendar.start()

    await vi.advanceTimersByTimeAsync(4_000)
    expect(remote.fetchCalls).toBe(1)
    expect(calendar.getSnapshot().status).toBe('error')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(remote.fetchCalls).toBe(2)
    expect(calendar.getSnapshot().status).toBe('synced')
    await calendar.stop()
  })

  it('does not let provider data overwrite a pending offline record', async () => {
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => false })
    await calendar.start()
    const localId = await calendar.addActivity(activityInput)

    calendar.updateFromProviders('family-1', { ...providerSnapshot(), activities: [] })

    expect(calendar.getSnapshot().data.activities).toEqual([
      expect.objectContaining({ id: localId, title: 'Swimming' }),
    ])
    expect(calendar.getSnapshot().mutations).toHaveLength(1)
    expect(calendar.getSnapshot().status).toBe('offline')
    expect(remote.fetchCalls).toBe(0)
    await calendar.stop()
  })

  it('keeps a usable stored snapshot when deferred reconciliation is degraded', async () => {
    vi.useFakeTimers()
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    remote.fetchFailures = 1
    await store.saveCalendarSnapshot({
      scopeKey: 'user-1:family-1', userId: 'user-1', familyId: 'family-1',
      schemaVersion: CALENDAR_LOCAL_SCHEMA_VERSION, hasSnapshot: true, data: serverData(),
      lastSuccessfulSyncAt: '2026-07-18T10:00:00Z',
    })
    const calendar = repository({ store, remote, isOnline: () => true })
    await calendar.start()
    await vi.advanceTimersByTimeAsync(4_000)

    expect(calendar.getSnapshot()).toMatchObject({ ready: true, hasUsableData: true, status: 'error' })
    await calendar.stop()
  })

  it('persists an offline create and restores it after an app restart', async () => {
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const first = repository({ store, remote, isOnline: () => false })
    await first.start()
    const localId = await first.addActivity(activityInput)
    expect(first.getSnapshot()).toMatchObject({ status: 'offline', hasUsableData: true })
    expect(first.getSnapshot().data.activities[0]).toMatchObject({ id: localId, title: 'Swimming' })
    await first.stop()

    const restarted = repository({ store, remote, isOnline: () => false })
    await restarted.start()
    expect(restarted.getSnapshot().data.activities).toHaveLength(1)
    expect(restarted.getSnapshot().mutations).toHaveLength(1)
    await restarted.stop()
  })

  it('synchronizes a queued record once and keeps the stable local id', async () => {
    let online = false
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => online })
    await calendar.start()
    const localId = await calendar.addActivity(activityInput)

    online = true
    await calendar.sync()
    await calendar.sync()

    expect(remote.data.activities).toHaveLength(1)
    expect(remote.data.activities[0].id).toBe(localId)
    expect(calendar.getSnapshot()).toMatchObject({ status: 'synced', mutations: [] })
    expect(remote.calls).toBe(1)
    await calendar.stop()
  })

  it('deduplicates manual retry against an in-flight automatic queue sync', async () => {
    let online = false
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => online })
    await calendar.start()
    await calendar.addActivity(activityInput)
    online = true

    await Promise.all([calendar.sync(), calendar.retry()])

    expect(remote.calls).toBe(1)
    expect(remote.data.activities).toHaveLength(1)
    expect(calendar.getSnapshot().mutations).toHaveLength(0)
    await calendar.stop()
  })

  it('preserves the queue when the connection drops after the server commit and retries idempotently', async () => {
    let online = false
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const calendar = repository({ store, remote, isOnline: () => online })
    await calendar.start()
    await calendar.addActivity(activityInput)

    online = true
    remote.failAfterCommit = true
    await calendar.sync()
    expect(calendar.getSnapshot().mutations).toHaveLength(1)
    expect(await store.loadCalendarMutations('user-1:family-1')).toHaveLength(1)

    remote.failAfterCommit = false
    await calendar.retry()
    expect(remote.data.activities).toHaveLength(1)
    expect(calendar.getSnapshot().mutations).toHaveLength(0)
    await calendar.stop()
  })

  it('keeps snapshots and pending operations isolated by account and family scope', async () => {
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const firstUser = repository({ store, remote, isOnline: () => false, userId: 'user-1' })
    await firstUser.start()
    await firstUser.addActivity(activityInput)
    await firstUser.stop()

    const secondUser = repository({ store, remote, isOnline: () => false, userId: 'user-2' })
    await secondUser.start()
    expect(secondUser.getSnapshot()).toMatchObject({ hasUsableData: false, mutations: [] })
    expect(secondUser.getSnapshot().data.activities).toEqual([])
    await secondUser.stop()
  })

  it('marks validation failures for user action without dropping the local record', async () => {
    let online = false
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    remote.permanentFailure = true
    const calendar = repository({ store, remote, isOnline: () => online })
    await calendar.start()
    await calendar.addActivity(activityInput)
    online = true
    await calendar.sync()

    expect(calendar.getSnapshot().status).toBe('error')
    expect(calendar.getSnapshot().mutations[0]).toMatchObject({ status: 'failed', retryable: false })
    expect(calendar.getSnapshot().data.activities).toHaveLength(1)
    await calendar.stop()
  })
})

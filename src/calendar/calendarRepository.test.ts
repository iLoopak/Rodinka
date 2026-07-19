import { describe, expect, it } from 'vitest'
import type { ActivityInput } from '../domain/activities/types'
import { MemoryShoppingStore } from '../shopping/shoppingIndexedDb'
import { applyPendingCalendarMutations } from './calendarMutationQueue'
import { CalendarRepository } from './calendarRepository'
import { emptyCalendarData, type CalendarMutation, type CalendarSnapshotData } from './calendarTypes'
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

  async fetchSnapshot() { return structuredClone(this.data) }
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
    realtime: async () => async () => undefined,
    createId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => new Date('2026-07-18T20:00:00Z'),
  })
}

describe('offline calendar repository', () => {
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

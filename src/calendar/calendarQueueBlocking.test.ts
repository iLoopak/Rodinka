import { describe, expect, it } from 'vitest'
import { CalendarRepository } from './calendarRepository'
import { emptyCalendarData, type CalendarMutation, type CalendarSnapshotData } from './calendarTypes'
import { MemoryShoppingStore } from '../shopping/shoppingIndexedDb'
import type { CalendarRemote } from './calendarSync'
import type { ChoreInput } from '../utils/choreModel'

const choreInput = {
  title: 'Vynést koš', description: '', assignedTo: null, dueDate: '2026-07-21',
  rewardAmount: 0, rewardEnabled: false, rewardCurrency: 'CZK', requiresApproval: false,
  category: 'household', priority: 'normal', recurring: false, recurrenceType: 'one_off',
  recurrenceWeekdays: [], preferredDayOfMonth: null,
} as unknown as ChoreInput

class ScriptedRemote implements CalendarRemote {
  applied: string[] = []
  snapshots = 0
  /** localId -> error thrown on every attempt. */
  failures = new Map<string, unknown>()

  async applyMutation(mutation: CalendarMutation) {
    const failure = this.failures.get(mutation.localId)
    if (failure) throw failure
    this.applied.push(mutation.localId)
  }

  async fetchSnapshot(): Promise<CalendarSnapshotData> {
    this.snapshots += 1
    return emptyCalendarData()
  }
}

/**
 * Queues everything while offline, then comes online. Adding a chore online
 * schedules a microtask sync, so building the scenario that way races the
 * assertions -- the first mutation can reach the remote before the test has
 * even said it should fail.
 */
function repository(remote: ScriptedRemote) {
  let id = 0
  const state = { online: false }
  const repo = new CalendarRepository({
    familyId: 'family-1', userId: 'user-1', currentMemberId: 'member-1',
    store: new MemoryShoppingStore(), remote, isOnline: () => state.online,
    createId: () => `id-${++id}`,
    now: () => new Date('2026-07-20T10:00:00Z'),
  })
  return { repo, goOnline: () => { state.online = true } }
}

describe('calendar queue head-of-line blocking', () => {
  it('lets the queue past a mutation that keeps failing for its own reasons', async () => {
    const remote = new ScriptedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    const blocked = await repo.addChore(choreInput)
    const behind = await repo.addChore({ ...choreInput, title: 'Umýt nádobí' })
    remote.failures.set(blocked, { code: 'PGRST301', message: 'something specific to this row' })
    goOnline()
    await repo.sync()

    // The first mutation used to throw out of the loop on any retryable
    // error, so everything queued behind it never got a turn.
    expect(remote.applied).toContain(behind)
    await repo.stop()
  })

  it('parks a mutation that has exhausted its attempts so it stops holding the queue', async () => {
    const remote = new ScriptedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    const doomed = await repo.addChore(choreInput)
    remote.failures.set(doomed, { code: 'PGRST301', message: 'still failing' })
    goOnline()
    for (let attempt = 0; attempt < 6; attempt += 1) await repo.sync()

    const [mutation] = repo.getSnapshot().mutations
    // An error that keeps coming back is not retryable in practice, whatever
    // its SQLSTATE suggests. Parking it hands the user retry/discard.
    expect(mutation.retryable).toBe(false)
    expect(mutation.status).toBe('failed')
    expect(repo.getSnapshot().status).toBe('error')
    await repo.stop()
  })

  it('does not spend the attempt budget while the network is down', async () => {
    const remote = new ScriptedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    const queued = await repo.addChore(choreInput)
    remote.failures.set(queued, new TypeError('Failed to fetch'))
    goOnline()
    for (let attempt = 0; attempt < 6; attempt += 1) await repo.sync()

    const [mutation] = repo.getSnapshot().mutations
    // Someone offline for a week must not come back to parked work the
    // server never even saw.
    expect(mutation.attempts).toBe(0)
    expect(mutation.retryable).toBe(true)
    await repo.stop()
  })

  it('still stops the run on a transport failure rather than hammering every mutation', async () => {
    const remote = new ScriptedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    const first = await repo.addChore(choreInput)
    await repo.addChore({ ...choreInput, title: 'Umýt nádobí' })
    remote.failures.set(first, new TypeError('Failed to fetch'))
    goOnline()
    await repo.sync()

    // The network being down says something about every mutation, so there
    // is no point walking the rest of the queue into the same wall.
    expect(remote.applied).toEqual([])
    expect(repo.getSnapshot().mutations.every((mutation) => mutation.retryable)).toBe(true)
    await repo.stop()
  })

  it('keeps skipping a permanently rejected mutation without blocking the rest', async () => {
    const remote = new ScriptedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    const rejected = await repo.addChore(choreInput)
    const behind = await repo.addChore({ ...choreInput, title: 'Umýt nádobí' })
    remote.failures.set(rejected, { code: '23505', message: 'duplicate key' })
    goOnline()
    await repo.sync()

    expect(remote.applied).toContain(behind)
    const parked = repo.getSnapshot().mutations.find((mutation) => mutation.localId === rejected)
    expect(parked?.retryable).toBe(false)
    await repo.stop()
  })
})

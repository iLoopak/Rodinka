// @vitest-environment jsdom
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

/**
 * The calendar half of "reconnect must not create duplicate server records".
 * apply_calendar_mutation dedupes on operationId, which only helps while the
 * client keeps that key stable across retries and reloads and never runs two
 * syncs over one queue.
 */
class GatedRemote implements CalendarRemote {
  /** Every operationId handed to the server, including failed attempts. */
  attempted: string[] = []
  applied: string[] = []
  failures = new Map<string, unknown>()
  private release: (() => void) | null = null
  private gate: Promise<void> | null = null

  hold() { this.gate = new Promise<void>((resolve) => { this.release = resolve }) }
  letThrough() {
    this.release?.()
    this.gate = null
    this.release = null
  }

  async applyMutation(mutation: CalendarMutation) {
    this.attempted.push(mutation.operationId)
    const failure = this.failures.get(mutation.operationId)
    if (failure) {
      this.failures.delete(mutation.operationId)
      throw failure
    }
    if (this.gate) await this.gate
    this.applied.push(mutation.operationId)
  }

  async fetchSnapshot(): Promise<CalendarSnapshotData> { return emptyCalendarData() }
}

const SCOPE = 'user-1:family-1'

function counter() {
  let id = 0
  return () => `id-${++id}`
}

/**
 * `nextId` is shared across repositories on purpose. With a per-repository
 * counter a restarted repo would mint 'id-1' again, so a key regenerated at
 * send time would coincidentally equal the persisted one and the reload test
 * below would pass while proving nothing.
 */
function repository(remote: GatedRemote, store = new MemoryShoppingStore(), nextId = counter()) {
  const state = { online: false }
  const repo = new CalendarRepository({
    familyId: 'family-1', userId: 'user-1', currentMemberId: 'member-1',
    store, remote, isOnline: () => state.online,
    createId: nextId,
    now: () => new Date('2026-07-20T10:00:00Z'),
  })
  return { repo, store, goOnline: () => { state.online = true } }
}

async function settle() {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
}

describe('calendar reconnect storm', () => {
  it('applies each mutation once when the online event fires repeatedly', async () => {
    const remote = new GatedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    await repo.addChore(choreInput)
    await repo.addChore({ ...choreInput, title: 'Umýt nádobí' })
    goOnline()

    remote.hold()
    const first = repo.sync()
    await settle()
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    await settle()
    remote.letThrough()
    await first
    await repo.sync()
    await settle()

    expect(remote.applied).toHaveLength(2)
    expect(new Set(remote.attempted).size).toBe(remote.attempted.length)
    await repo.stop()
  })

  it('resends a failed mutation under its original operation id', async () => {
    const remote = new GatedRemote()
    const { repo, store, goOnline } = repository(remote)
    await repo.start()

    await repo.addChore(choreInput)
    const [queued] = await store.loadCalendarMutations(SCOPE)
    remote.failures.set(queued.operationId, new TypeError('Failed to fetch'))
    goOnline()

    await repo.sync()
    await repo.sync()

    expect(remote.attempted).toHaveLength(2)
    expect(remote.attempted[0]).toBe(remote.attempted[1])
    expect(remote.applied).toHaveLength(1)
    await repo.stop()
  })

  it('keeps the operation id stable across a reload', async () => {
    const store = new MemoryShoppingStore()
    const remote = new GatedRemote()

    const nextId = counter()
    const first = repository(remote, store, nextId)
    await first.repo.start()
    await first.repo.addChore(choreInput)
    const [persisted] = await store.loadCalendarMutations(SCOPE)
    await first.repo.stop()

    // A fresh repository reads the queue back out of IndexedDB, the way a
    // restarted app does. A key minted at send time would duplicate the row.
    const restarted = repository(remote, store, nextId)
    await restarted.repo.start()
    restarted.goOnline()
    await restarted.repo.sync()

    expect(remote.attempted).toEqual([persisted.operationId])
    await restarted.repo.stop()
  })

  it('does not double-apply when a manual retry lands during an automatic sync', async () => {
    const remote = new GatedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    await repo.addChore(choreInput)
    goOnline()

    remote.hold()
    const automatic = repo.sync()
    await settle()
    const manual = repo.retry()
    await settle()
    remote.letThrough()
    await Promise.all([automatic, manual])
    await settle()

    expect(remote.applied).toHaveLength(1)
    expect(new Set(remote.attempted).size).toBe(remote.attempted.length)
    await repo.stop()
  })
})

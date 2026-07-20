import { describe, expect, it } from 'vitest'
import { createReminderSyncCoordinator } from './reminderSyncCoordinator'
import type { ReminderProcessingService, ReminderSyncInput } from '../data/reminderRepository'

function fakeService() {
  const calls: ReminderSyncInput[] = []
  let release: (() => void) | null = null
  let gate: Promise<void> | null = null
  const service: ReminderProcessingService = {
    async synchronizeSources(input) {
      calls.push(input)
      if (gate) await gate
    },
  }
  return {
    service,
    calls,
    hold() { gate = new Promise<void>((resolve) => { release = resolve }) },
    letThrough() { release?.(); gate = null; release = null },
  }
}

const drafts = [{ dedupeKey: 'chore:1', title: 'Vynést koš' }]

describe('reminder sync coordinator', () => {
  it('syncs the first time it sees a set of drafts', async () => {
    const { service, calls } = fakeService()
    const coordinator = createReminderSyncCoordinator(service)

    expect(await coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })).toBe('synced')
    expect(calls).toHaveLength(1)
  })

  it('skips a repeat request whose drafts have not changed', async () => {
    const { service, calls } = fakeService()
    const coordinator = createReminderSyncCoordinator(service)
    await coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })

    // Draft generation reruns whenever any of eight source domains emits. A
    // renamed chore or a toggled shopping item produces identical drafts and
    // used to fire the RPC plus a full reminders reload anyway.
    const outcome = await coordinator.requestSync({ reason: 'drafts-changed', familyId: 'f1', drafts })

    expect(outcome).toBe('skipped')
    expect(calls).toHaveLength(1)
  })

  it('syncs again once the drafts genuinely differ', async () => {
    const { service, calls } = fakeService()
    const coordinator = createReminderSyncCoordinator(service)
    await coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })

    await coordinator.requestSync({
      reason: 'drafts-changed', familyId: 'f1',
      drafts: [{ dedupeKey: 'chore:1', title: 'Vynést koš dnes' }],
    })

    expect(calls).toHaveLength(2)
  })

  it('always reaches the server for a user action, even with unchanged drafts', async () => {
    const { service, calls } = fakeService()
    const coordinator = createReminderSyncCoordinator(service)
    await coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })

    // Somebody is watching a button. "Nothing changed" is not an acceptable
    // answer to an explicit refresh.
    expect(await coordinator.requestSync({ reason: 'user-action', familyId: 'f1', drafts })).toBe('synced')
    expect(calls).toHaveLength(2)
  })

  it('joins an in-flight sync instead of starting a second one', async () => {
    const { service, calls, hold, letThrough } = fakeService()
    const coordinator = createReminderSyncCoordinator(service)
    hold()

    const first = coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })
    const second = coordinator.requestSync({ reason: 'foreground', familyId: 'f1', drafts })
    letThrough()

    expect(await first).toBe('synced')
    expect(await second).toBe('joined')
    expect(calls).toHaveLength(1)
  })

  it('retries after a failure rather than treating the drafts as synced', async () => {
    let attempts = 0
    const service: ReminderProcessingService = {
      async synchronizeSources() {
        attempts += 1
        if (attempts === 1) throw new Error('reminders:reminders.sync:backend-unavailable')
      },
    }
    const coordinator = createReminderSyncCoordinator(service)

    await expect(coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })).rejects.toThrow()
    // The failed attempt must not be remembered as the last synced set, or the
    // drafts would never be sent again.
    expect(await coordinator.requestSync({ reason: 'drafts-changed', familyId: 'f1', drafts })).toBe('synced')
    expect(attempts).toBe(2)
  })

  it('treats the same drafts in a different family as a new sync', async () => {
    const { service, calls } = fakeService()
    const coordinator = createReminderSyncCoordinator(service)
    await coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })

    await coordinator.requestSync({ reason: 'startup', familyId: 'f2', drafts })

    expect(calls.map((call) => call.familyId)).toEqual(['f1', 'f2'])
  })

  it('forgets the last synced set when reset', async () => {
    const { service, calls } = fakeService()
    const coordinator = createReminderSyncCoordinator(service)
    await coordinator.requestSync({ reason: 'startup', familyId: 'f1', drafts })

    coordinator.reset()
    await coordinator.requestSync({ reason: 'drafts-changed', familyId: 'f1', drafts })

    expect(calls).toHaveLength(2)
  })
})

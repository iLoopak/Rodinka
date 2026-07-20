import type { ReminderProcessingService } from '../data/reminderRepository'

export type ReminderSyncReason =
  | 'startup'
  | 'drafts-changed'
  | 'user-action'
  | 'foreground'
  | 'reconnect'

export interface ReminderSyncRequest {
  reason: ReminderSyncReason
  familyId: string
  drafts: unknown[]
}

/**
 * Owns "when does the server regenerate reminders".
 *
 * The rule that matters: a request carrying drafts identical to the last
 * successfully synced set is dropped. Draft generation runs whenever any of
 * eight source domains emits, so without this the RPC fired for a renamed
 * chore or a toggled shopping item — changes that cannot alter a reminder.
 *
 * A concurrent request joins the in-flight one instead of starting a second.
 * The service takes explicit drafts rather than importing feature contexts, so
 * it stays testable and has no opinion about React.
 */
export function createReminderSyncCoordinator(service: ReminderProcessingService) {
  let inFlight: Promise<void> | null = null
  let lastSyncedSignature: string | null = null

  async function requestSync(request: ReminderSyncRequest): Promise<'synced' | 'skipped' | 'joined'> {
    const signature = `${request.familyId}::${JSON.stringify(request.drafts)}`

    // A user action always reaches the server: someone waiting on a button
    // should not be told "nothing changed".
    if (request.reason !== 'user-action' && signature === lastSyncedSignature) return 'skipped'
    if (inFlight) { await inFlight; return 'joined' }

    const operation = service.synchronizeSources({ familyId: request.familyId, drafts: request.drafts })
      .then(() => { lastSyncedSignature = signature })
      .finally(() => { inFlight = null })
    inFlight = operation
    await operation
    return 'synced'
  }

  return {
    requestSync,
    /** Used when the account or family changes and the memo no longer applies. */
    reset() { lastSyncedSignature = null },
  }
}

export type ReminderSyncCoordinator = ReturnType<typeof createReminderSyncCoordinator>

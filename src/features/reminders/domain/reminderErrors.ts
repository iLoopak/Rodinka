import { type AppErrorCode } from '../../../errors/errorCodes'
import { createDomainErrorConverter, DomainError, extractErrorMessage } from '../../../errors/domainError'

export type RemindersOperation =
  | 'reminders.summary'
  | 'reminders.list'
  | 'reminders.setState'
  | 'reminders.loadPreferences'
  | 'reminders.savePreferences'
  | 'reminders.sync'

export class RemindersError extends DomainError<RemindersOperation> {
  constructor(operation: RemindersOperation, code: AppErrorCode, cause?: unknown) {
    super('RemindersError', 'reminders', operation, code, cause)
  }
}

function refine(operation: RemindersOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  // A cursor pointing past rows the sync RPC has since replaced is a stale
  // read, not a missing page: the caller should restart from the top.
  if (operation === 'reminders.list' && code === 'not-found') return 'conflict'
  // Timezone and quiet-hours values are validated by a CHECK constraint, so a
  // 23514 here is the user's input being wrong, not the app misbehaving.
  if (operation === 'reminders.savePreferences' && /check constraint|invalid input|timezone/i.test(extractErrorMessage(error))) {
    return 'conflict'
  }
  return code
}

export const toRemindersError = createDomainErrorConverter(RemindersError, refine)

/**
 * Push failures must not be reported as reminder-repository failures: the
 * reminder was generated and stored correctly, only its delivery to a device
 * did not happen, and telling the user their reminders failed would be wrong.
 */
export function isReminderRepositoryError(error: unknown): error is RemindersError {
  return error instanceof RemindersError
}

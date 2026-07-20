import { classifyAppError, isRetryableErrorCode, type AppErrorCode } from '../../../errors/errorCodes'

export type RemindersOperation =
  | 'reminders.summary'
  | 'reminders.list'
  | 'reminders.setState'
  | 'reminders.loadPreferences'
  | 'reminders.savePreferences'
  | 'reminders.sync'

export class RemindersError extends Error {
  readonly code: AppErrorCode
  readonly operation: RemindersOperation
  readonly retryable: boolean

  constructor(operation: RemindersOperation, code: AppErrorCode, cause?: unknown) {
    super(`reminders:${operation}:${code}`)
    this.name = 'RemindersError'
    this.operation = operation
    this.code = code
    this.retryable = isRetryableErrorCode(code)
    this.cause = cause
  }
}

function message(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
}

function refine(operation: RemindersOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  // A cursor pointing past rows the sync RPC has since replaced is a stale
  // read, not a missing page: the caller should restart from the top.
  if (operation === 'reminders.list' && code === 'not-found') return 'conflict'
  // Timezone and quiet-hours values are validated by a CHECK constraint, so a
  // 23514 here is the user's input being wrong, not the app misbehaving.
  if (operation === 'reminders.savePreferences' && /check constraint|invalid input|timezone/i.test(message(error))) {
    return 'conflict'
  }
  return code
}

export function toRemindersError(operation: RemindersOperation, error: unknown): RemindersError {
  if (error instanceof RemindersError) return error
  const browserOnline = typeof navigator === 'undefined' ? undefined : navigator.onLine !== false
  return new RemindersError(operation, refine(operation, classifyAppError(error, { browserOnline }), error), error)
}

/**
 * Push failures must not be reported as reminder-repository failures: the
 * reminder was generated and stored correctly, only its delivery to a device
 * did not happen, and telling the user their reminders failed would be wrong.
 */
export function isReminderRepositoryError(error: unknown): error is RemindersError {
  return error instanceof RemindersError
}

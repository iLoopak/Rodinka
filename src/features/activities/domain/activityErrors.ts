import { classifyAppError, isRetryableErrorCode, type AppErrorCode } from '../../../errors/errorCodes'

export type ActivitiesOperation =
  | 'activities.list'
  | 'activities.get'
  | 'activities.createSeries'
  | 'activities.updateSeries'
  | 'activities.markPaymentPaid'
  | 'occurrences.list'
  | 'occurrences.setMemberOverride'

/**
 * The occurrence RPCs are transactional on the server. When one fails, nothing
 * was written — so the caller can roll its optimistic state back whole rather
 * than guessing which half landed.
 */
export class ActivitiesError extends Error {
  readonly code: AppErrorCode
  readonly operation: ActivitiesOperation
  readonly retryable: boolean

  constructor(operation: ActivitiesOperation, code: AppErrorCode, cause?: unknown) {
    super(`activities:${operation}:${code}`)
    this.name = 'ActivitiesError'
    this.operation = operation
    this.code = code
    this.retryable = isRetryableErrorCode(code)
    this.cause = cause
  }
}

function message(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
}

/**
 * A `not found` from the override RPC means the series or occurrence moved on
 * while the sheet was open — a stale override rather than a missing feature.
 * The user needs fresh data, so it is a conflict and not retryable.
 */
function refine(operation: ActivitiesOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  if (operation !== 'occurrences.setMemberOverride') return code
  if (code === 'not-found') return 'conflict'
  if (code === 'mutation-failed' && /no longer|not part of|removed|inactive/i.test(message(error))) return 'conflict'
  return code
}

export function toActivitiesError(operation: ActivitiesOperation, error: unknown): ActivitiesError {
  if (error instanceof ActivitiesError) return error
  const browserOnline = typeof navigator === 'undefined' ? undefined : navigator.onLine !== false
  return new ActivitiesError(operation, refine(operation, classifyAppError(error, { browserOnline }), error), error)
}

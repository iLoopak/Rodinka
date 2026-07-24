import { type AppErrorCode } from '../../../errors/errorCodes'
import { createDomainErrorConverter, DomainError, extractErrorMessage } from '../../../errors/domainError'

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
export class ActivitiesError extends DomainError<ActivitiesOperation> {
  constructor(operation: ActivitiesOperation, code: AppErrorCode, cause?: unknown) {
    super('ActivitiesError', 'activities', operation, code, cause)
  }
}

/**
 * A `not found` from the override RPC means the series or occurrence moved on
 * while the sheet was open — a stale override rather than a missing feature.
 * The user needs fresh data, so it is a conflict and not retryable.
 */
function refine(operation: ActivitiesOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  if (operation !== 'occurrences.setMemberOverride') return code
  if (code === 'not-found') return 'conflict'
  if (code === 'mutation-failed' && /no longer|not part of|removed|inactive/i.test(extractErrorMessage(error))) return 'conflict'
  return code
}

export const toActivitiesError = createDomainErrorConverter(ActivitiesError, refine)

import { classifyAppError, isRetryableErrorCode, type AppErrorCode } from '../../../errors/errorCodes'

export type MealsOperation =
  | 'meals.list'
  | 'meals.create'
  | 'meals.update'
  | 'plan.list'
  | 'plan.create'
  | 'plan.update'
  | 'plan.delete'
  | 'plan.copyWeek'
  | 'voting.list'
  | 'voting.createRound'
  | 'voting.addCandidates'
  | 'voting.openRound'
  | 'voting.closeRound'
  | 'voting.castVote'

/**
 * What the meals domain hands upwards instead of a PostgrestError.
 *
 * The UI gets a code and a retryability flag; the original error is kept only
 * so a developer console can show it. Nothing above the repository parses
 * Postgres message text.
 */
export class MealsError extends Error {
  readonly code: AppErrorCode
  readonly operation: MealsOperation
  readonly retryable: boolean

  constructor(operation: MealsOperation, code: AppErrorCode, cause?: unknown) {
    super(`meals:${operation}:${code}`)
    this.name = 'MealsError'
    this.operation = operation
    this.code = code
    this.retryable = isRetryableErrorCode(code)
    this.cause = cause
  }
}

/**
 * A vote round that is not open rejects with P0001 from the RPC. That is a
 * `conflict` rather than a generic mutation failure: the round moved on, and
 * the UI should tell the user to reload rather than offer a retry.
 */
function refineVotingCode(operation: MealsOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  if (code !== 'mutation-failed') return code
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
  const votingOperation = operation.startsWith('voting.')
  if (votingOperation && /round is not open|already closed|not open/i.test(message)) return 'conflict'
  return code
}

export function toMealsError(operation: MealsOperation, error: unknown): MealsError {
  if (error instanceof MealsError) return error
  const browserOnline = typeof navigator === 'undefined' ? undefined : navigator.onLine !== false
  const code = refineVotingCode(operation, classifyAppError(error, { browserOnline }), error)
  return new MealsError(operation, code, error)
}

import { type AppErrorCode } from '../../../errors/errorCodes'
import { createDomainErrorConverter, DomainError, extractErrorMessage } from '../../../errors/domainError'

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
export class MealsError extends DomainError<MealsOperation> {
  constructor(operation: MealsOperation, code: AppErrorCode, cause?: unknown) {
    super('MealsError', 'meals', operation, code, cause)
  }
}

/**
 * A vote round that is not open rejects with P0001 from the RPC. That is a
 * `conflict` rather than a generic mutation failure: the round moved on, and
 * the UI should tell the user to reload rather than offer a retry.
 */
function refineVotingCode(operation: MealsOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  if (code !== 'mutation-failed') return code
  const votingOperation = operation.startsWith('voting.')
  if (votingOperation && /round is not open|already closed|not open/i.test(extractErrorMessage(error))) return 'conflict'
  return code
}

export const toMealsError = createDomainErrorConverter(MealsError, refineVotingCode)

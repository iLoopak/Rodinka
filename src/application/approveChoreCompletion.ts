import type { ChoreApprovalResult } from '../domain/chores/types'
import type { ChoresRepository } from '../repositories/chores/choresRepository'

export async function approveChoreCompletion(
  dependencies: { choresRepository: ChoresRepository; reconcile: () => Promise<void> },
  completionId: string,
): Promise<ChoreApprovalResult> {
  const result = await dependencies.choresRepository.approveCompletion(completionId)
  await dependencies.reconcile()
  return result
}

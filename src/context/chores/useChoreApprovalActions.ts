import { useCallback } from 'react'
import { useChoresData } from './ChoresContext'
import { useAllowanceData } from './AllowanceContext'
import type { ChoreApprovalResult } from '../../domain/chores/types'

// Approving/completing a chore server-side both marks the completion and
// (when there's a matching allowance plan) credits the ledger in one RPC —
// so the client must refresh chores+completions+ledger together to stay
// consistent. This is the one place that composes Chores and Allowance;
// `reject` never touches the ledger, so it's used straight from useChoresData().
export function useChoreApprovalActions() {
  const { approve: approveRaw, markDone: markDoneRaw } = useChoresData()
  const { refreshLedger } = useAllowanceData()

  const approve = useCallback(
    async (completionId: string): Promise<ChoreApprovalResult> => {
      const result = await approveRaw(completionId)
      await refreshLedger()
      return result
    },
    [approveRaw, refreshLedger]
  )

  const markDone = useCallback(
    async (choreId: string, assignedTo?: string, occurrenceDate?: string) => {
      await markDoneRaw(choreId, assignedTo, occurrenceDate)
      await refreshLedger()
    },
    [markDoneRaw, refreshLedger]
  )

  return { approve, markDone }
}

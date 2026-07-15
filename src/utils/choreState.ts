import type { Chore } from './choreModel.ts'

export interface ChoreCompletionStateSource {
  status: 'pending_approval' | 'approved' | 'rejected'
  occurrence_due_date: string
}

export type ChoreState = 'actionable' | 'pending' | 'done' | 'archived'

// Shared rule for what still "needs doing" until real due dates/recurrence
// land (Phase 1.5B): a chore with no completion, or whose latest completion
// was rejected, is actionable again. An approved one-off chore is done for
// good; an approved recurring chore becomes actionable again.
export function getChoreState(chore: Chore, latest: ChoreCompletionStateSource | null): ChoreState {
  if (chore.status === 'archived') {
    return chore.recurrence_type === 'none'
      && latest?.status === 'approved'
      && (chore.due_date === null || latest.occurrence_due_date === chore.due_date)
      ? 'done'
      : 'archived'
  }
  if (!latest || latest.status === 'rejected') return 'actionable'
  if (latest.status === 'pending_approval') return 'pending'
  // latest.status === 'approved'
  return chore.recurrence_type === 'none' && (chore.due_date === null || latest.occurrence_due_date === chore.due_date)
    ? 'done'
    : 'actionable'
}

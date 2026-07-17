import type { Chore } from '../hooks/useChores'
import { getEffectiveOccurrenceMember, type OccurrenceOverride, type SeriesAssignmentHistory } from './occurrenceAssignments'

export function childVisibleChores(
  childId: string,
  chores: Chore[],
  overrides: OccurrenceOverride[],
  assignmentHistory: SeriesAssignmentHistory[],
): Chore[] {
  return chores.flatMap((chore) => {
    const effectiveAssignee = chore.due_date ? getEffectiveOccurrenceMember({
      seriesType: 'task', seriesId: chore.id, occurrenceDate: chore.due_date,
      defaultMemberId: chore.assigned_to, overrides, assignmentHistory,
    }).memberId : chore.assigned_to
    return effectiveAssignee === childId ? [{ ...chore, assigned_to: childId }] : []
  })
}

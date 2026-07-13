import { useState } from 'react'
import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import { classifyDueDate, formatDueDateLabel } from '../utils/dueDate'

interface Props {
  chores: Chore[]
  memberName: (id: string) => string
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  onMarkDone: (choreId: string, assignedTo: string) => Promise<void>
}

export function ChoreList({ chores, memberName, latestCompletionFor, onMarkDone }: Props) {
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleMarkDone(chore: Chore) {
    setMarkingId(chore.id)
    setError(null)
    try {
      await onMarkDone(chore.id, chore.assigned_to)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMarkingId(null)
    }
  }

  if (chores.length === 0) {
    return <p className="empty-state">{t.chores.noChores}</p>
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <ul className="section-list">
        {chores.map((chore) => {
          const latest = latestCompletionFor(chore.id)
          const isPending = latest?.status === 'pending_approval'
          const isDone = !chore.recurring && latest?.status === 'approved'
          const dueUrgency = classifyDueDate(chore.due_date)
          const dueLabel = formatDueDateLabel(chore.due_date)

          return (
            <li key={chore.id}>
              <span className="row-title">{chore.title}</span>
              <span className="row-meta">{memberName(chore.assigned_to)}</span>
              {chore.description && <p className="row-description">{chore.description}</p>}
              <span className="row-spacer" />
              {dueUrgency === 'overdue' ? (
                <span className="badge badge-overdue">{dueLabel}</span>
              ) : (
                <span className="row-meta">{dueLabel}</span>
              )}
              <span className="row-amount">{t.chores.formatAmount(chore.reward_amount)}</span>
              {isPending && <span className="badge badge-pending">{t.chores.pendingBadge}</span>}
              {isDone && <span className="badge badge-done">{t.chores.doneBadge}</span>}
              {!isPending && !isDone && (
                <button onClick={() => handleMarkDone(chore)} disabled={markingId === chore.id}>
                  {markingId === chore.id ? t.chores.markingDone : t.chores.markDone}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

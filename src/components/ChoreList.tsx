import { useState } from 'react'
import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'

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
    return <p>{t.chores.noChores}</p>
  }

  return (
    <div className="chore-list">
      {error && <p className="error">{error}</p>}
      <ul>
        {chores.map((chore) => {
          const latest = latestCompletionFor(chore.id)
          const isPending = latest?.status === 'pending_approval'
          const isDone = !chore.recurring && latest?.status === 'approved'

          return (
            <li key={chore.id}>
              <strong>{chore.title}</strong> — {memberName(chore.assigned_to)}
              {chore.description && <p>{chore.description}</p>}
              <span> {t.chores.formatAmount(chore.reward_amount)}</span>
              {isPending && <span className="badge">{t.chores.pendingBadge}</span>}
              {isDone && <span className="badge">{t.chores.doneBadge}</span>}
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

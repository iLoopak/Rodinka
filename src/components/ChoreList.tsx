import { useState } from 'react'
import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { DueBadge } from './ui/DueBadge'
import { MemberAvatar } from './ui/MemberAvatar'

interface Props {
  chores: Chore[]
  memberById: (id: string) => FamilyMember | undefined
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  onMarkDone: (choreId: string, assignedTo: string) => Promise<void>
  onSelect: (chore: Chore) => void
}

export function ChoreList({ chores, memberById, latestCompletionFor, onMarkDone, onSelect }: Props) {
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
          const assignee = memberById(chore.assigned_to)
          const latest = latestCompletionFor(chore.id)
          const isPending = latest?.status === 'pending_approval'
          const isDone = !chore.recurring && latest?.status === 'approved'

          return (
            <li key={chore.id}>
              <MemberAvatar member={assignee} />
              <span className="row-title">{chore.title}</span>
              <span className="row-meta">{assignee?.display_name ?? '?'}</span>
              {chore.description && <p className="row-description">{chore.description}</p>}
              <span className="row-spacer" />
              <DueBadge dueDate={chore.due_date} completed={isDone} />
              <span className="row-amount">{t.chores.formatAmount(chore.reward_amount)}</span>
              {isPending && <span className="badge badge-pending">{t.chores.pendingBadge}</span>}
              <button type="button" className="btn-secondary" onClick={() => onSelect(chore)}>
                {t.deepLinks.openDetail}
              </button>
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

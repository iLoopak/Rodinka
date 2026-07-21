import { useState } from 'react'
import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { DueBadge } from './ui/DueBadge'
import { MemberAvatar } from './ui/MemberAvatar'
import { getChoreState } from '../utils/choreState'
import { choreRecurrenceSummary } from '../utils/choreRecurrence'
import { CompletionCheckbox } from './ui/CompletionCheckbox'
import { ListRow } from './ui/ListRow'
import { StatusPill } from './ui/StatusPill'
import { StateView } from './ui/StateView'

interface Props {
  chores: Chore[]
  memberById: (id: string) => FamilyMember | undefined
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  onMarkDone: (choreId: string, assignedTo?: string) => Promise<void>
  onSelect: (chore: Chore) => void
}

export function ChoreList({ chores, memberById, latestCompletionFor, onMarkDone, onSelect }: Props) {
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleMarkDone(chore: Chore) {
    setMarkingId(chore.id)
    setError(null)
    try {
      await onMarkDone(chore.id, chore.assigned_to ?? undefined)
    } catch {
      setError(t.errors.generic)
    } finally {
      setMarkingId(null)
    }
  }

  if (chores.length === 0) {
    return <StateView variant="empty" title={t.chores.noChores} />
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <ul className="list-rows">
        {chores.map((chore) => {
          const assignee = chore.assigned_to ? memberById(chore.assigned_to) : undefined
          const latest = latestCompletionFor(chore.id)
          const state = getChoreState(chore, latest)
          const isPending = state === 'pending'
          const isDone = state === 'done' || state === 'archived'

          return (
            <li key={chore.id}>
              <ListRow
                leading={
                  <>
                    {state === 'actionable' && (
                      <CompletionCheckbox
                        checked={false}
                        label={`${t.chores.markDone}: ${chore.title}`}
                        disabled={markingId === chore.id}
                        onClick={() => handleMarkDone(chore)}
                      />
                    )}
                    <MemberAvatar member={assignee} />
                  </>
                }
                title={chore.title}
                meta={assignee?.display_name ?? t.chores.unassigned}
                description={
                  <>
                    {chore.description && <span>{chore.description}</span>}
                    <span className="recurrence-summary">{choreRecurrenceSummary(chore)}</span>
                  </>
                }
                trailing={
                  <>
                    <DueBadge dueDate={chore.due_date} completed={isDone} />
                    {chore.reward_enabled && (
                      <span className="list-row__amount">{t.chores.formatAmount(chore.reward_amount)}</span>
                    )}
                    {isPending && <StatusPill tone="pending">{t.chores.pendingBadge}</StatusPill>}
                    <button type="button" className="btn-secondary" onClick={() => onSelect(chore)}>
                      {t.deepLinks.openDetail}
                    </button>
                  </>
                }
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

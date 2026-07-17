import { useState } from 'react'
import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { MemberAvatar } from './ui/MemberAvatar'
import type { ChoreApprovalResult } from '../domain/chores/types'

interface Props {
  completions: ChoreCompletion[]
  chores: Chore[]
  memberById: (id: string) => FamilyMember | undefined
  onApprove: (completionId: string) => Promise<ChoreApprovalResult>
  onReject: (completionId: string) => Promise<void>
}

export function PendingApprovals({ completions, chores, memberById, onApprove, onReject }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function choreFor(choreId: string) {
    return chores.find((c) => c.id === choreId) ?? null
  }

  async function handleApprove(completion: ChoreCompletion) {
    setBusyId(completion.id)
    setBusyAction('approve')
    setError(null)
    try {
      await onApprove(completion.id)
    } catch {
      setError(t.errors.generic)
    } finally {
      setBusyId(null)
      setBusyAction(null)
    }
  }

  async function handleReject(completion: ChoreCompletion) {
    setBusyId(completion.id)
    setBusyAction('reject')
    setError(null)
    try {
      await onReject(completion.id)
    } catch {
      setError(t.errors.generic)
    } finally {
      setBusyId(null)
      setBusyAction(null)
    }
  }

  if (completions.length === 0) {
    return null
  }

  return (
    <div>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="section-list plain-list">
        {completions.map((completion) => {
          const chore = choreFor(completion.chore_id)
          const completedBy = completion.completed_by ? memberById(completion.completed_by) : undefined
          const busy = busyId === completion.id
          return (
            <li key={completion.id}>
              <MemberAvatar member={completedBy} />
              <span className="row-title">{chore?.title ?? '?'}</span>
              <span className="row-meta">
                {t.memberGrammar.completedBy(
                  completedBy?.display_name ?? '?',
                  completedBy?.grammatical_gender ?? null
                )}
              </span>
              <span className="row-spacer" />
              <button className="btn-secondary" onClick={() => handleReject(completion)} disabled={busy}>
                {busy && busyAction === 'reject' ? t.chores.rejecting : t.chores.reject}
              </button>
              <button onClick={() => handleApprove(completion)} disabled={busy}>
                {busy && busyAction === 'approve' ? t.chores.approving : t.chores.approve}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

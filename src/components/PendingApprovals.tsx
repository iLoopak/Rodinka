import { useState } from 'react'
import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'

interface Props {
  completions: ChoreCompletion[]
  chores: Chore[]
  memberName: (id: string) => string
  onApprove: (completionId: string) => Promise<void>
  onReject: (completionId: string) => Promise<void>
}

export function PendingApprovals({ completions, chores, memberName, onApprove, onReject }: Props) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
      {error && <p className="error">{error}</p>}
      <ul className="section-list">
        {completions.map((completion) => {
          const chore = choreFor(completion.chore_id)
          const busy = busyId === completion.id
          return (
            <li key={completion.id}>
              <span className="row-title">{chore?.title ?? '?'}</span>
              <span className="row-meta">{t.chores.completedBy(memberName(completion.completed_by))}</span>
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

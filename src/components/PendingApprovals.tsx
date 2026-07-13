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

  return (
    <div className="pending-approvals">
      <h3>{t.chores.approvalsTitle}</h3>
      {error && <p className="error">{error}</p>}
      {completions.length === 0 ? (
        <p>{t.chores.noApprovals}</p>
      ) : (
        <ul>
          {completions.map((completion) => {
            const chore = choreFor(completion.chore_id)
            const busy = busyId === completion.id
            return (
              <li key={completion.id}>
                <strong>{chore?.title ?? '?'}</strong>
                {' — '}
                {t.chores.completedBy(memberName(completion.completed_by))}
                <button onClick={() => handleApprove(completion)} disabled={busy}>
                  {busy && busyAction === 'approve' ? t.chores.approving : t.chores.approve}
                </button>
                <button onClick={() => handleReject(completion)} disabled={busy}>
                  {busy && busyAction === 'reject' ? t.chores.rejecting : t.chores.reject}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

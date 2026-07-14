import { useState } from 'react'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { t } from '../strings'
import { getChoreState } from '../utils/choreState'
import { formatFullDate } from '../utils/dueDate'
import { Modal } from './ui/Modal'
import { MemberAvatar } from './ui/MemberAvatar'
import { ShareLinkButton } from './ui/ShareLinkButton'

interface Props {
  chore: Chore
  assignee: FamilyMember | undefined
  latestCompletion: ChoreCompletion | null
  onMarkDone: (choreId: string, assignedTo: string) => Promise<void>
  onClose: () => void
}

export function ChoreDetailModal({ chore, assignee, latestCompletion, onMarkDone, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actionable = getChoreState(chore, latestCompletion) === 'actionable'

  async function handleMarkDone() {
    setBusy(true)
    setError(null)
    try {
      await onMarkDone(chore.id, chore.assigned_to)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={chore.title} onClose={onClose}>
      <div className="detail-view">
        {assignee && <div className="detail-person">
          <MemberAvatar member={assignee} />
          <span>{assignee.display_name}</span>
        </div>}
        <p className="row-meta">{formatFullDate(chore.due_date)}</p>
        <p className="row-meta">{t.chores.formatAmount(chore.reward_amount)}</p>
        {chore.description && <p className="row-description">{chore.description}</p>}
      </div>
      <div className="family-actions">
        {actionable && <button type="button" onClick={handleMarkDone} disabled={busy}>
          {busy ? t.chores.markingDone : t.chores.markDone}
        </button>}
        <ShareLinkButton route="/chores" param="chore" id={chore.id} title={chore.title} />
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  )
}

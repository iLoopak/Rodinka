import { useState } from 'react'
import type { Chore, ChoreInput } from '../utils/choreModel'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { t } from '../strings'
import { getChoreState, type ChoreState } from '../utils/choreState'
import { choreRecurrenceSummary } from '../utils/choreRecurrence'
import { formatFullDate } from '../utils/dueDate'
import { Modal } from './ui/Modal'
import { MemberAvatar } from './ui/MemberAvatar'
import { ShareLinkButton } from './ui/ShareLinkButton'
import { AddChoreForm } from './AddChoreForm'

interface Props {
  chore: Chore
  assignee: FamilyMember | undefined
  members: FamilyMember[]
  currentMemberId: string
  completions: ChoreCompletion[]
  latestCompletion: ChoreCompletion | null
  canManage: boolean
  onMarkDone: (choreId: string, assignedTo: string) => Promise<void>
  onUpdate: (choreId: string, input: ChoreInput) => Promise<void>
  onSetArchived: (choreId: string, archived: boolean) => Promise<void>
  onClose: () => void
}

function stateLabel(state: ChoreState): string {
  if (state === 'pending') return t.chores.statePending
  if (state === 'done') return t.chores.stateDone
  if (state === 'archived') return t.chores.stateArchived
  return t.chores.stateActionable
}

function completionStatusLabel(status: ChoreCompletion['status']): string {
  if (status === 'approved') return t.chores.historyApproved
  if (status === 'rejected') return t.chores.historyRejected
  return t.chores.historyPending
}

export function ChoreDetailModal({
  chore,
  assignee,
  members,
  currentMemberId,
  completions,
  latestCompletion,
  canManage,
  onMarkDone,
  onUpdate,
  onSetArchived,
  onClose,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = getChoreState(chore, latestCompletion)
  const pending = state === 'pending'

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

  async function handleSave(input: ChoreInput) {
    await onUpdate(chore.id, input)
    setEditing(false)
  }

  async function handleArchiveChange() {
    if (chore.status === 'active' && !window.confirm(t.chores.archiveConfirm(chore.title))) return
    setBusy(true)
    setError(null)
    try {
      await onSetArchived(chore.id, chore.status === 'active')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? t.chores.editTitle : chore.title} onClose={onClose}>
      {editing ? (
        <AddChoreForm
          members={members}
          currentMemberId={currentMemberId}
          initial={chore}
          requiresNewDueDate={state === 'done'}
          onSubmit={handleSave}
        />
      ) : <>
        <div className="detail-view">
          {assignee && <div className="detail-person">
            <MemberAvatar member={assignee} />
            <span>{assignee.display_name}</span>
          </div>}
          <p className="row-meta">{formatFullDate(chore.due_date)}</p>
          <p className="row-meta">{t.chores.formatAmount(chore.reward_amount)}</p>
          {chore.description && <p className="row-description">{chore.description}</p>}
          <dl className="detail-facts">
            <div><dt>{t.chores.recurrenceDetailLabel}</dt><dd>{choreRecurrenceSummary(chore)}</dd></div>
            <div><dt>{t.chores.currentStatusLabel}</dt><dd>{stateLabel(state)}</dd></div>
          </dl>
        </div>

        {pending && canManage && <p className="info-note">{t.chores.editBlockedPending}</p>}
        {state === 'done' && canManage && <p className="info-note">{t.chores.restoreCompletedHint}</p>}

        <div className="family-actions">
          {state === 'actionable' && <button type="button" onClick={handleMarkDone} disabled={busy}>
            {busy ? t.chores.markingDone : t.chores.markDone}
          </button>}
          {canManage && <button type="button" className="btn-secondary" onClick={() => setEditing(true)} disabled={pending || busy}>
            {t.chores.edit}
          </button>}
          {canManage && <button type="button" className="btn-secondary danger-action" onClick={handleArchiveChange} disabled={pending || busy || (chore.status === 'archived' && state === 'done')}>
            {chore.status === 'archived' ? t.chores.restore : t.chores.archive}
          </button>}
          <ShareLinkButton route="/chores" param="chore" id={chore.id} title={chore.title} />
        </div>

        <section className="chore-history">
          <h4>{t.chores.historyTitle}</h4>
          {completions.length === 0 ? <p className="empty-state">{t.chores.historyEmpty}</p> : (
            <ul className="compact-list">
              {completions.map((completion) => <li key={completion.id}>
                <strong>{completion.chore_title}</strong>
                <span>{completionStatusLabel(completion.status)}</span>
                <span>{t.chores.historyDue(formatFullDate(completion.occurrence_due_date))}</span>
                <span>{t.chores.formatAmount(completion.reward_amount)}</span>
              </li>)}
            </ul>
          )}
        </section>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  )
}

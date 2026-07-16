import { useState } from 'react'
import { TASK_CATEGORIES, type Chore, type ChoreInput } from '../utils/choreModel'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { t } from '../strings'
import { getChoreState, type ChoreState } from '../utils/choreState'
import { choreRecurrenceSummary } from '../utils/choreRecurrence'
import { formatFullDate } from '../utils/dueDate'
import { Modal } from './ui/Modal'
import { ConfirmDestructiveActionDialog, DestructiveIconButton } from './ui/DestructiveActions'
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
  initialEditing?: boolean
  closeAfterSave?: boolean
  onMarkDone: (choreId: string, assignedTo?: string) => Promise<void>
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
  initialEditing = false,
  closeAfterSave = false,
  onMarkDone,
  onUpdate,
  onSetArchived,
  onClose,
}: Props) {
  const [editing, setEditing] = useState(initialEditing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false)
  const state = getChoreState(chore, latestCompletion)
  const pending = state === 'pending'

  async function handleMarkDone() {
    setBusy(true)
    setError(null)
    try {
      await onMarkDone(chore.id, chore.assigned_to ?? undefined)
      onClose()
    } catch (err) {
      console.error('Failed to complete chore:', err)
      setError(t.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(input: ChoreInput) {
    await onUpdate(chore.id, input)
    if (closeAfterSave) onClose()
    else setEditing(false)
  }

  async function handleArchiveChange() {
    setBusy(true)
    setError(null)
    try {
      await onSetArchived(chore.id, chore.status === 'active')
    } catch (err) {
      console.error('Failed to change chore archive state:', err)
      setError(t.errors.generic)
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
          {!assignee && <p className="row-meta">{t.chores.unassigned}</p>}
          <p className="row-meta">{chore.due_date ? formatFullDate(chore.due_date) : t.chores.noDueDate}</p>
          {chore.reward_enabled && <p className="row-meta">{t.chores.formatAmount(chore.reward_amount)}</p>}
          {chore.description && <p className="row-description">{chore.description}</p>}
          <dl className="detail-facts">
            <div><dt>{t.chores.recurrenceDetailLabel}</dt><dd>{choreRecurrenceSummary(chore)}</dd></div>
            {chore.category && <div><dt>{t.chores.categoryLabel}</dt><dd>{t.chores.categoryLabels[TASK_CATEGORIES.indexOf(chore.category)]}</dd></div>}
            {chore.priority && chore.priority !== 'normal' && <div><dt>{t.chores.priorityLabel}</dt><dd>{chore.priority === 'high' ? t.chores.priorityHigh : t.chores.priorityLow}</dd></div>}
            {chore.requires_approval && <div><dt>{t.chores.requiresApproval}</dt><dd>{t.chores.enabledValue}</dd></div>}
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
          {canManage && <DestructiveIconButton
            label={chore.status === 'archived' ? t.chores.restore : t.chores.archive}
            title={chore.status === 'archived' ? t.chores.restore : t.chores.archive}
            onClick={() => setConfirmArchiveOpen(true)}
            disabled={pending || busy || (chore.status === 'archived' && state === 'done')}
          />}
          <ShareLinkButton route="/chores" param="chore" id={chore.id} title={chore.title} />
        </div>

        <ConfirmDestructiveActionDialog
          open={confirmArchiveOpen}
          title={t.chores.archiveConfirm(chore.title)}
          objectName={chore.title}
          explanation={chore.status === 'archived' ? t.chores.restoreExplanation : t.chores.archiveExplanation}
          consequences={[chore.status === 'archived' ? t.chores.restoreCompletedHint : t.chores.editBlockedPending]}
          confirmLabel={chore.status === 'archived' ? t.chores.restoreAction : t.chores.archiveAction}
          busy={busy}
          error={error}
          onCancel={() => setConfirmArchiveOpen(false)}
          onConfirm={async () => { await handleArchiveChange(); setConfirmArchiveOpen(false) }}
        />

        <section className="chore-history">
          <h4>{t.chores.historyTitle}</h4>
          {completions.length === 0 ? <p className="empty-state">{t.chores.historyEmpty}</p> : (
            <ul className="compact-list">
              {completions.map((completion) => <li key={completion.id}>
                <strong>{completion.chore_title}</strong>
                <span>{completionStatusLabel(completion.status)}</span>
                <span>{t.chores.historyDue(formatFullDate(completion.occurrence_due_date))}</span>
                <span>{t.chores.historyAssigned(completion.assigned_member_id ? members.find((member) => member.id === completion.assigned_member_id)?.display_name ?? t.family.removedMemberBadge : t.chores.unassigned)}</span>
                {completion.assignment_was_override && <span className="badge">↔ {t.chores.historyAssignmentOverride}</span>}
                {(completion.reward_enabled ?? completion.reward_amount > 0) && <span>{t.chores.formatAmount(completion.reward_amount)}</span>}
              </li>)}
            </ul>
          )}
        </section>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  )
}

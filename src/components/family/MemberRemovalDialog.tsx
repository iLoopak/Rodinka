import { useMemo, useState } from 'react'
import type { Activity } from '../../hooks/useActivities'
import type { Chore } from '../../hooks/useChores'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import { todayISODate } from '../../utils/dueDate'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'

interface Props {
  member: FamilyMember
  activeMembers: FamilyMember[]
  chores: Chore[]
  activities: Activity[]
  onConfirm: (replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign') => Promise<void>
  onClose: () => void
  selfLeave?: boolean
}

export function MemberRemovalDialog({ member, activeMembers, chores, activities, onConfirm, onClose, selfLeave = false }: Props) {
  const replacements = activeMembers.filter((candidate) => candidate.id !== member.id)
  const adultReplacements = replacements.filter((candidate) => candidate.role === 'admin' || candidate.role === 'parent')
  const [taskStrategy, setTaskStrategy] = useState<'unassign' | 'reassign'>('unassign')
  const [activityStrategy, setActivityStrategy] = useState<'clear' | 'reassign'>('clear')
  const [replacementId, setReplacementId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayISODate()
  const openTaskCount = useMemo(() => chores.filter((task) => task.status === 'active' && task.assigned_to === member.id).length, [chores, member.id])
  const futureActivityCount = useMemo(() => activities.filter((activity) => activity.status === 'active' && activity.responsible_member_id === member.id && activity.start_date >= today).length, [activities, member.id, today])
  const requiresReplacement = taskStrategy === 'reassign' || activityStrategy === 'reassign'
  const replacementOptions = activityStrategy === 'reassign' ? adultReplacements : replacements
  const validReplacement = !requiresReplacement || replacementOptions.some((candidate) => candidate.id === replacementId)

  async function confirm() {
    if (!validReplacement) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm(requiresReplacement ? replacementId : null, taskStrategy, activityStrategy)
      onClose()
    } catch {
      setError(t.family.removalError)
    } finally {
      setBusy(false)
    }
  }

  const destructiveLabel = selfLeave ? t.family.leaveHouseholdAction : t.family.removeMemberAction

  return <Modal title={selfLeave ? t.family.leaveHouseholdTitle : t.family.removeMemberTitle(member.display_name)} onClose={busy ? () => undefined : onClose} closeOnBackdrop={false}>
    <div className="member-removal-summary">
      <MemberAvatar member={member} size={56} />
      <div><strong>{member.display_name}</strong><p>{selfLeave ? t.family.leaveHouseholdExplain : t.family.removeMemberExplain}</p></div>
    </div>
    {member.user_id && <p className="info-note">{t.family.linkedAccessWarning}</p>}
    <p className="row-meta">{t.family.openTasksCount(openTaskCount)} · {t.family.futureActivitiesCount(futureActivityCount)}</p>

    <fieldset className="form-section">
      <legend>{t.family.taskRemovalStrategy}</legend>
      <label className="checkbox-row"><input type="radio" name="task-strategy" checked={taskStrategy === 'unassign'} onChange={() => setTaskStrategy('unassign')} />{t.family.leaveUnassigned}</label>
      <label className="checkbox-row"><input type="radio" name="task-strategy" checked={taskStrategy === 'reassign'} onChange={() => setTaskStrategy('reassign')} disabled={replacements.length === 0} />{t.family.reassignToMember}</label>
    </fieldset>
    <fieldset className="form-section">
      <legend>{t.family.activityRemovalStrategy}</legend>
      <label className="checkbox-row"><input type="radio" name="activity-strategy" checked={activityStrategy === 'clear'} onChange={() => setActivityStrategy('clear')} />{t.family.clearCompanion}</label>
      <label className="checkbox-row"><input type="radio" name="activity-strategy" checked={activityStrategy === 'reassign'} onChange={() => setActivityStrategy('reassign')} disabled={adultReplacements.length === 0} />{t.family.reassignToMember}</label>
    </fieldset>
    {requiresReplacement && <label>{t.family.replacementMember}
      <select required value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
        <option value="">—</option>
        {replacementOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.display_name}</option>)}
      </select>
    </label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="btn-danger" disabled={busy || !validReplacement} onClick={confirm}>{busy ? t.family.removingMember : destructiveLabel}</button>
      <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{t.common.close}</button>
    </div>
  </Modal>
}

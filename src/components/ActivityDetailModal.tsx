import { useState } from 'react'
import { t } from '../strings'
import { formatFullDate } from '../utils/dueDate'
import { nextOccurrenceDate } from '../utils/recurrence'
import { activityCategoryLabel, activityRecurrenceLabel, activityWeekdaysSummary } from '../utils/activityLabels'
import type { Activity } from '../hooks/useActivities'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { ActivityInput } from '../context/FamilyDataContext'
import { Modal } from './ui/Modal'
import { MemberAvatar } from './ui/MemberAvatar'
import { AddActivityForm } from './AddActivityForm'

interface Props {
  activity: Activity
  members: FamilyMember[]
  kids: FamilyMember[]
  currentMemberId: string
  memberName: (id: string) => string
  memberById: (id: string) => FamilyMember | undefined
  onUpdate: (id: string, input: ActivityInput) => Promise<void>
  onClose: () => void
}

export function ActivityDetailModal({
  activity,
  members,
  kids,
  currentMemberId,
  memberName,
  memberById,
  onUpdate,
  onClose,
}: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <Modal title={t.activities.editTitle} onClose={onClose}>
        <AddActivityForm
          members={members}
          kids={kids}
          currentMemberId={currentMemberId}
          initial={activity}
          onSubmit={async (input) => {
            await onUpdate(activity.id, input)
            onClose()
          }}
        />
      </Modal>
    )
  }

  const next = nextOccurrenceDate(activity)
  const scheduleParts = [
    activityRecurrenceLabel(activity.recurrence_type),
    activity.recurrence_type === 'custom_weekdays' ? activityWeekdaysSummary(activity.recurrence_weekdays) : null,
    activity.start_time,
  ].filter(Boolean)

  const coachParts = [activity.coach_name, activity.coach_phone, activity.coach_email].filter(Boolean)
  const child = memberById(activity.child_id)
  const responsible = activity.responsible_member_id
    ? memberById(activity.responsible_member_id)
    : undefined

  return (
    <Modal title={activity.title} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta">{activityCategoryLabel(activity.category)}</p>

        <div className="detail-people">
          <div className="detail-person">
            <MemberAvatar member={child} />
            <span>{child?.display_name ?? memberName(activity.child_id)}</span>
          </div>
          {activity.responsible_member_id ? (
            <div className="detail-person">
              <MemberAvatar member={responsible} />
              <span>{responsible?.display_name ?? memberName(activity.responsible_member_id)}</span>
            </div>
          ) : (
            <p className="row-meta">{t.activities.detailNoResponsible}</p>
          )}
        </div>

        {scheduleParts.length > 0 && <p className="row-meta">{scheduleParts.join(' · ')}</p>}
        {next && <p className="row-meta">{t.activities.nextOccurrence(formatFullDate(next))}</p>}
        {activity.location && <p className="row-meta">{activity.location}</p>}
        {coachParts.length > 0 && <p className="row-meta">{coachParts.join(' · ')}</p>}

        {activity.payment_amount ? (
          <p className="row-meta">
            {t.chores.formatAmount(activity.payment_amount)}
            {activity.next_payment_due_date ? ` · ${formatFullDate(activity.next_payment_due_date)}` : ''}
          </p>
        ) : (
          <p className="row-meta">{t.activities.detailNoPayment}</p>
        )}

        {activity.notes && <p className="row-description">{activity.notes}</p>}
      </div>
      <button className="btn-secondary" onClick={() => setEditing(true)}>
        {t.activities.edit}
      </button>
    </Modal>
  )
}

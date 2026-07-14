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
import { ShareLinkButton } from './ui/ShareLinkButton'

interface Props {
  activity: Activity
  members: FamilyMember[]
  kids: FamilyMember[]
  memberName: (id: string) => string
  memberById: (id: string) => FamilyMember | undefined
  onUpdate: (id: string, input: ActivityInput) => Promise<void>
  onMarkPaymentPaid: (id: string) => Promise<void>
  onClose: () => void
}

export function ActivityDetailModal({
  activity,
  members,
  kids,
  memberName,
  memberById,
  onUpdate,
  onMarkPaymentPaid,
  onClose,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(false)

  if (editing) {
    return (
      <Modal title={t.activities.editTitle} onClose={onClose} className="activity-form-modal">
        <AddActivityForm
          members={members}
          kids={kids}
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
  const participants = activity.participant_ids.map(memberById).filter((member) => !!member)
  const responsible = activity.responsible_member_id
    ? memberById(activity.responsible_member_id)
    : undefined

  return (
    <Modal title={activity.title} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta">{activity.kind === 'event' ? t.activities.kindEvent : t.activities.kindClub} · {activityCategoryLabel(activity.category)}</p>

        <div className="detail-people">
          {participants.map((participant) => <div className="detail-person" key={participant.id}>
            <MemberAvatar member={participant} />
            <span>{participant.display_name}</span>
          </div>)}
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
        {activity.recurrence_type === 'one_off' && <p className="row-meta">
          {formatFullDate(activity.start_date)}{activity.end_date && activity.end_date !== activity.start_date ? ` – ${formatFullDate(activity.end_date)}` : ''}
          {activity.all_day ? ` · ${t.activities.allDayLabel}` : ''}
        </p>}
        {next && <p className="row-meta">{t.activities.nextOccurrence(formatFullDate(next))}</p>}
        {activity.location && <p className="row-meta">{activity.location}</p>}
        {activity.kind === 'club' && coachParts.length > 0 && <p className="row-meta">{coachParts.join(' · ')}</p>}

        {activity.kind === 'club' && (activity.payment_amount ? (
          <p className="row-meta">
            {t.chores.formatAmount(activity.payment_amount)}
            {activity.next_payment_due_date ? ` · ${formatFullDate(activity.next_payment_due_date)}` : ''}
          </p>
        ) : (
          <p className="row-meta">{t.activities.detailNoPayment}</p>
        ))}

        {activity.notes && <p className="row-description">{activity.notes}</p>}
      </div>
      <div className="family-actions">
        {activity.next_payment_due_date && activity.payment_paid_for_date !== activity.next_payment_due_date && <button className="btn-secondary" disabled={paymentBusy} onClick={async () => { setPaymentBusy(true); try { await onMarkPaymentPaid(activity.id); onClose() } finally { setPaymentBusy(false) } }}>{t.activities.markPaymentPaid}</button>}
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          {t.activities.edit}
        </button>
        <ShareLinkButton route="/activities" param="activity" id={activity.id} title={activity.title} />
      </div>
    </Modal>
  )
}

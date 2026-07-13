import { useState } from 'react'
import { t } from '../strings'
import { todayISODate } from '../utils/dueDate'
import {
  ACTIVITY_CATEGORY_VALUES,
  ACTIVITY_PAYMENT_FREQUENCY_VALUES,
  ACTIVITY_RECURRENCE_VALUES,
  ACTIVITY_STATUS_VALUES,
  activityCategoryLabel,
  activityPaymentFrequencyLabel,
  activityRecurrenceLabel,
  activityStatusLabel,
  activityWeekdayOptions,
} from '../utils/activityLabels'
import type { ActivityInput } from '../context/FamilyDataContext'
import type { Activity, ActivityCategory, ActivityPaymentFrequency, ActivityRecurrenceType } from '../hooks/useActivities'
import type { FamilyMember } from '../hooks/useFamilyMembers'

const CATEGORY_OPTIONS = ACTIVITY_CATEGORY_VALUES.map((value) => ({ value, label: activityCategoryLabel(value) }))
const RECURRENCE_OPTIONS = ACTIVITY_RECURRENCE_VALUES.map((value) => ({
  value,
  label: activityRecurrenceLabel(value),
}))
const PAYMENT_FREQUENCY_OPTIONS = ACTIVITY_PAYMENT_FREQUENCY_VALUES.map((value) => ({
  value,
  label: activityPaymentFrequencyLabel(value),
}))
const WEEKDAY_OPTIONS = activityWeekdayOptions()
const STATUS_OPTIONS = ACTIVITY_STATUS_VALUES.map((value) => ({ value, label: activityStatusLabel(value) }))

interface Props {
  members: FamilyMember[]
  kids: FamilyMember[]
  currentMemberId: string
  initial?: Activity
  initialStartDate?: string
  onSubmit: (input: ActivityInput) => Promise<void>
}

export function AddActivityForm({ members, kids, currentMemberId, initial, initialStartDate, onSubmit }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<ActivityCategory>(initial?.category ?? 'other')
  const [childId, setChildId] = useState(initial?.child_id ?? kids[0]?.id ?? '')
  const [responsibleMemberId, setResponsibleMemberId] = useState(
    initial?.responsible_member_id ?? currentMemberId
  )
  const [secondaryResponsibleMemberId, setSecondaryResponsibleMemberId] = useState(
    initial?.secondary_responsible_member_id ?? ''
  )
  const [skillLevel, setSkillLevel] = useState(initial?.skill_level ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [coachName, setCoachName] = useState(initial?.coach_name ?? '')
  const [coachPhone, setCoachPhone] = useState(initial?.coach_phone ?? '')
  const [coachEmail, setCoachEmail] = useState(initial?.coach_email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? initialStartDate ?? todayISODate())
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [recurrenceType, setRecurrenceType] = useState<ActivityRecurrenceType>(
    initial?.recurrence_type ?? 'weekly'
  )
  const [weekdays, setWeekdays] = useState<number[]>(initial?.recurrence_weekdays ?? [])
  const [startTime, setStartTime] = useState(initial?.start_time ?? '')
  const [endTime, setEndTime] = useState(initial?.end_time ?? '')
  const [paymentAmount, setPaymentAmount] = useState(
    initial?.payment_amount != null ? String(initial.payment_amount) : ''
  )
  const [paymentFrequency, setPaymentFrequency] = useState<ActivityPaymentFrequency | ''>(
    initial?.payment_frequency ?? ''
  )
  const [nextPaymentDueDate, setNextPaymentDueDate] = useState(initial?.next_payment_due_date ?? '')
  const [status, setStatus] = useState<Activity['status']>(initial?.status ?? 'active')
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminder_enabled ?? false)
  const [reminderDaysBefore, setReminderDaysBefore] = useState(
    initial?.reminder_days_before != null ? String(initial.reminder_days_before) : ''
  )

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!childId || !members.some((m) => m.id === childId)) {
      setError(t.activities.errors.childRequired)
      return
    }
    if (!startDate) {
      setError(t.activities.errors.startDateRequired)
      return
    }
    if (recurrenceType === 'custom_weekdays' && weekdays.length === 0) {
      setError(t.activities.errors.weekdaysRequired)
      return
    }
    if (endDate && endDate < startDate) {
      setError(t.activities.errors.endDateBeforeStart)
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        title,
        category,
        childId,
        responsibleMemberId: responsibleMemberId || null,
        secondaryResponsibleMemberId: secondaryResponsibleMemberId || null,
        location,
        coachName,
        coachPhone,
        coachEmail,
        notes,
        skillLevel,
        startDate,
        endDate: endDate || null,
        recurrenceType,
        recurrenceWeekdays: recurrenceType === 'custom_weekdays' ? weekdays : null,
        startTime: startTime || null,
        endTime: endTime || null,
        paymentAmount: paymentAmount ? Number(paymentAmount) : null,
        paymentFrequency: paymentFrequency || null,
        nextPaymentDueDate: nextPaymentDueDate || null,
        status,
        reminderEnabled,
        reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="sectioned-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <h4>{t.activities.sectionBasic}</h4>
        <label>
          {t.activities.titleLabel}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.activities.titlePlaceholder}
          />
        </label>
        <label>
          {t.activities.categoryLabel}
          <select value={category} onChange={(e) => setCategory(e.target.value as ActivityCategory)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.activities.skillLevelLabel}
          <input
            value={skillLevel}
            onChange={(e) => setSkillLevel(e.target.value)}
            placeholder={t.activities.skillLevelPlaceholder}
          />
        </label>
        {initial && (
          <label>
            {t.activities.statusLabel}
            <select value={status} onChange={(e) => setStatus(e.target.value as Activity['status'])}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="form-section">
        <h4>{t.activities.sectionParticipants}</h4>
        <label>
          {t.activities.childLabel}
          <select required value={childId} onChange={(e) => setChildId(e.target.value)}>
            {kids.map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.activities.responsibleLabel}
          <select value={responsibleMemberId} onChange={(e) => setResponsibleMemberId(e.target.value)}>
            <option value="">{t.activities.responsibleNone}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.activities.secondaryResponsibleLabel}
          <select
            value={secondaryResponsibleMemberId}
            onChange={(e) => setSecondaryResponsibleMemberId(e.target.value)}
          >
            <option value="">{t.activities.responsibleNone}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-section">
        <h4>{t.activities.sectionSchedule}</h4>
        <label>
          {t.activities.startDateLabel}
          <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          {t.activities.endDateLabel}
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label>
          {t.activities.recurrenceLabel}
          <select
            value={recurrenceType}
            onChange={(e) => setRecurrenceType(e.target.value as ActivityRecurrenceType)}
          >
            {RECURRENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {recurrenceType === 'custom_weekdays' && (
          <div className="weekday-picker" role="group" aria-label={t.activities.weekdaysLabel}>
            {WEEKDAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`weekday-toggle${weekdays.includes(opt.value) ? ' active' : ''}`}
                aria-pressed={weekdays.includes(opt.value)}
                onClick={() => toggleWeekday(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <label>
          {t.activities.startTimeLabel}
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label>
          {t.activities.endTimeLabel}
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.activities.sectionContact}</h4>
        <label>
          {t.activities.locationLabel}
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          {t.activities.coachNameLabel}
          <input value={coachName} onChange={(e) => setCoachName(e.target.value)} />
        </label>
        <label>
          {t.activities.coachPhoneLabel}
          <input type="tel" value={coachPhone} onChange={(e) => setCoachPhone(e.target.value)} />
        </label>
        <label>
          {t.activities.coachEmailLabel}
          <input type="email" value={coachEmail} onChange={(e) => setCoachEmail(e.target.value)} />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.activities.sectionPayment}</h4>
        <label>
          {t.activities.paymentAmountLabel}
          <input
            type="number"
            min="0"
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />
        </label>
        <label>
          {t.activities.paymentFrequencyLabel}
          <select
            value={paymentFrequency}
            onChange={(e) => setPaymentFrequency(e.target.value as ActivityPaymentFrequency | '')}
          >
            <option value="">{t.activities.noPaymentFrequency}</option>
            {PAYMENT_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.activities.nextPaymentDueDateLabel}
          <input
            type="date"
            value={nextPaymentDueDate}
            onChange={(e) => setNextPaymentDueDate(e.target.value)}
          />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.activities.sectionReminders}</h4>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={reminderEnabled}
            onChange={(e) => setReminderEnabled(e.target.checked)}
          />
          {t.activities.reminderEnabledLabel}
        </label>
        {reminderEnabled && (
          <label>
            {t.activities.reminderDaysBeforeLabel}
            <input
              type="number"
              min="0"
              step="1"
              value={reminderDaysBefore}
              onChange={(e) => setReminderDaysBefore(e.target.value)}
            />
          </label>
        )}
        <label>
          {t.activities.notesLabel}
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? t.activities.submitting : initial ? t.activities.submitSave : t.activities.submitAdd}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

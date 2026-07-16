import { useState } from 'react'
import { t } from '../strings'
import { todayISODate } from '../utils/dueDate'
import {
  ACTIVITY_CATEGORY_VALUES,
  ACTIVITY_PAYMENT_FREQUENCY_VALUES,
  ACTIVITY_STATUS_VALUES,
  activityCategoryLabel,
  activityPaymentFrequencyLabel,
  activityStatusLabel,
} from '../utils/activityLabels'
import {
  activityHasAdvancedDetails,
  activityHasContact,
  activityHasPayment,
  defaultActivityCategory,
  selectedRecurrenceWeekdays,
  toggleRecurrenceWeekday,
} from '../utils/activityFormModel'
import type { ActivityInput } from '../domain/activities/types'
import type { Activity, ActivityCategory, ActivityKind, ActivityPaymentFrequency, ActivityRecurrenceType } from '../hooks/useActivities'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { ActivityParticipantPicker } from './activities/ActivityParticipantPicker'
import { ActivityRecurrencePicker } from './activities/ActivityRecurrencePicker'

const CATEGORY_OPTIONS = ACTIVITY_CATEGORY_VALUES.map((value) => ({ value, label: activityCategoryLabel(value) }))
const PAYMENT_FREQUENCY_OPTIONS = ACTIVITY_PAYMENT_FREQUENCY_VALUES.map((value) => ({
  value,
  label: activityPaymentFrequencyLabel(value),
}))
const STATUS_OPTIONS = ACTIVITY_STATUS_VALUES.map((value) => ({ value, label: activityStatusLabel(value) }))

interface Props {
  members: FamilyMember[]
  kids: FamilyMember[]
  initial?: Activity
  initialStartDate?: string
  onSubmit: (input: ActivityInput) => Promise<void>
}

interface FieldErrors {
  title?: string
  participants?: string
  startDate?: string
  weekdays?: string
  endDate?: string
}

export function AddActivityForm({ members, kids, initial, initialStartDate, onSubmit }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [kind, setKind] = useState<ActivityKind>(initial?.kind ?? 'club')
  const [category, setCategory] = useState<ActivityCategory>(initial?.category ?? 'other')
  const [participantIds, setParticipantIds] = useState<string[]>(
    initial?.participant_ids ?? (initial?.child_id ? [initial.child_id] : kids[0]?.id ? [kids[0].id] : [])
  )
  const [responsibleMemberId, setResponsibleMemberId] = useState(initial?.responsible_member_id ?? '')
  const [secondaryResponsibleMemberId, setSecondaryResponsibleMemberId] = useState(initial?.secondary_responsible_member_id ?? '')
  const [skillLevel, setSkillLevel] = useState(initial?.skill_level ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [coachName, setCoachName] = useState(initial?.coach_name ?? '')
  const [coachPhone, setCoachPhone] = useState(initial?.coach_phone ?? '')
  const [coachEmail, setCoachEmail] = useState(initial?.coach_email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? initialStartDate ?? todayISODate())
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [recurrenceType, setRecurrenceType] = useState<ActivityRecurrenceType>(initial?.recurrence_type ?? 'weekly')
  const [weekdays, setWeekdays] = useState<number[]>(initial?.recurrence_weekdays ?? [])
  const [startTime, setStartTime] = useState(initial?.start_time ?? '')
  const [endTime, setEndTime] = useState(initial?.end_time ?? '')
  const [allDay, setAllDay] = useState(initial?.all_day ?? false)
  const [paymentAmount, setPaymentAmount] = useState(initial?.payment_amount != null ? String(initial.payment_amount) : '')
  const [paymentFrequency, setPaymentFrequency] = useState<ActivityPaymentFrequency | ''>(initial?.payment_frequency ?? '')
  const [nextPaymentDueDate, setNextPaymentDueDate] = useState(initial?.next_payment_due_date ?? '')
  const [status, setStatus] = useState<Activity['status']>(initial?.status ?? 'active')
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminder_enabled ?? false)
  const [reminderDaysBefore, setReminderDaysBefore] = useState(
    initial?.reminder_days_before != null ? String(initial.reminder_days_before) : ''
  )

  const [advancedOpen, setAdvancedOpen] = useState(() => Boolean(initial && activityHasAdvancedDetails(initial)))
  const [contactOpen, setContactOpen] = useState(() => Boolean(initial && activityHasContact(initial)))
  const [paymentOpen, setPaymentOpen] = useState(() => Boolean(initial && activityHasPayment(initial)))
  const [scheduleTouched, setScheduleTouched] = useState(Boolean(initial))
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function changeKind(nextKind: ActivityKind) {
    setKind(nextKind)
    if (!initial && !categoryTouched) setCategory(defaultActivityCategory(nextKind))
    if (!initial && !scheduleTouched) {
      setRecurrenceType(nextKind === 'event' ? 'one_off' : 'weekly')
      setAllDay(nextKind === 'event')
    }
  }

  function changeRecurrence(next: ActivityRecurrenceType) {
    setScheduleTouched(true)
    setRecurrenceType(next)
    if (next === 'custom_weekdays' && weekdays.length === 0) {
      setWeekdays(selectedRecurrenceWeekdays('weekly', startDate, []))
    }
    setFieldErrors((previous) => ({ ...previous, weekdays: undefined }))
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!title.trim()) next.title = t.activities.errors.titleRequired
    if (participantIds.length === 0 || participantIds.some((id) => !members.some((member) => member.id === id))) {
      next.participants = t.activities.errors.participantRequired
    }
    if (!startDate) next.startDate = t.activities.errors.startDateRequired
    if (recurrenceType === 'custom_weekdays' && weekdays.length === 0) next.weekdays = t.activities.errors.weekdaysRequired
    if (endDate && endDate < startDate) next.endDate = t.activities.errors.endDateBeforeStart
    return next
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setSubmitError(null)
    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setLoading(true)
    try {
      await onSubmit({
        title: title.trim(),
        category,
        kind,
        allDay,
        participantIds,
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
        startTime: allDay ? null : startTime || null,
        endTime: allDay ? null : endTime || null,
        paymentAmount: paymentAmount ? Number(paymentAmount) : null,
        paymentFrequency: paymentFrequency || null,
        nextPaymentDueDate: nextPaymentDueDate || null,
        status,
        reminderEnabled,
        reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : null,
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  return <form className="activity-form" onSubmit={handleSubmit}>
    <div className="activity-form-scroll">
      <section className="activity-form-section activity-kind-section" aria-labelledby="activity-kind-heading">
        <h4 id="activity-kind-heading">{t.activities.kindLabel}</h4>
        <div className="activity-kind-options" role="group" aria-label={t.activities.kindLabel}>
          <button type="button" className={kind === 'club' ? 'selected' : ''} aria-pressed={kind === 'club'} onClick={() => changeKind('club')}>
            <span aria-hidden="true">↻</span><span>{t.activities.kindClub}</span>
          </button>
          <button type="button" className={kind === 'event' ? 'selected' : ''} aria-pressed={kind === 'event'} onClick={() => changeKind('event')}>
            <span aria-hidden="true">◇</span><span>{t.activities.kindEvent}</span>
          </button>
        </div>
      </section>

      <section className="activity-form-section">
        <label className="activity-title-field">
          <span>{t.activities.titleLabel}</span>
          <input
            autoFocus
            required
            value={title}
            aria-invalid={Boolean(fieldErrors.title) || undefined}
            onChange={(event) => {
              setTitle(event.target.value)
              setFieldErrors((previous) => ({ ...previous, title: undefined }))
            }}
            placeholder={kind === 'event' ? t.activities.eventTitlePlaceholder : t.activities.titlePlaceholder}
          />
        </label>
        {fieldErrors.title && <p className="field-error" role="alert">{fieldErrors.title}</p>}
      </section>

      <section className="activity-form-section">
        <ActivityParticipantPicker
          members={members}
          selectedIds={participantIds}
          invalid={Boolean(fieldErrors.participants)}
          onChange={(ids) => {
            setParticipantIds(ids)
            setFieldErrors((previous) => ({ ...previous, participants: undefined }))
          }}
        />
        {fieldErrors.participants && <p className="field-error" role="alert">{fieldErrors.participants}</p>}
      </section>

      <section className="activity-form-section activity-schedule-section">
        <div className="activity-field-heading">
          <h4>{t.activities.dateTimeTitle}</h4>
          <label className="compact-switch">
            <input type="checkbox" checked={allDay} onChange={(event) => { setAllDay(event.target.checked); setScheduleTouched(true) }} />
            <span>{t.activities.allDayLabel}</span>
          </label>
        </div>

        <div className={`activity-date-grid${recurrenceType === 'one_off' ? ' has-end' : ''}`}>
          <label>
            <span>{t.activities.startDateCompactLabel}</span>
            <input
              required
              type="date"
              value={startDate}
              aria-invalid={Boolean(fieldErrors.startDate) || undefined}
              onChange={(event) => {
                setStartDate(event.target.value)
                setScheduleTouched(true)
                setFieldErrors((previous) => ({ ...previous, startDate: undefined, endDate: undefined }))
              }}
            />
          </label>
          {recurrenceType === 'one_off' && <label>
            <span>{t.activities.eventEndDateLabel}</span>
            <input type="date" value={endDate} aria-invalid={Boolean(fieldErrors.endDate) || undefined} onChange={(event) => { setEndDate(event.target.value); setScheduleTouched(true); setFieldErrors((previous) => ({ ...previous, endDate: undefined })) }} />
          </label>}
        </div>
        {fieldErrors.startDate && <p className="field-error" role="alert">{fieldErrors.startDate}</p>}
        {fieldErrors.endDate && recurrenceType === 'one_off' && <p className="field-error" role="alert">{fieldErrors.endDate}</p>}

        {!allDay && <div className="activity-time-grid">
          <label><span>{t.activities.startTimeCompactLabel}</span><input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); setScheduleTouched(true) }} /></label>
          <label><span>{t.activities.endTimeCompactLabel}</span><input type="time" value={endTime} onChange={(event) => { setEndTime(event.target.value); setScheduleTouched(true) }} /></label>
        </div>}

        <ActivityRecurrencePicker
          value={recurrenceType}
          startDate={startDate}
          weekdays={weekdays}
          invalid={Boolean(fieldErrors.weekdays)}
          onChange={changeRecurrence}
          onToggleWeekday={(day) => {
            setWeekdays((previous) => toggleRecurrenceWeekday(previous, day))
            setScheduleTouched(true)
            setFieldErrors((previous) => ({ ...previous, weekdays: undefined }))
          }}
        />
        {fieldErrors.weekdays && <p className="field-error" role="alert">{fieldErrors.weekdays}</p>}

        {recurrenceType !== 'one_off' && <label className="activity-recurrence-end">
          <span>{t.activities.recurrenceEndCompactLabel}</span>
          <input type="date" value={endDate} aria-invalid={Boolean(fieldErrors.endDate) || undefined} onChange={(event) => { setEndDate(event.target.value); setScheduleTouched(true); setFieldErrors((previous) => ({ ...previous, endDate: undefined })) }} />
        </label>}
        {fieldErrors.endDate && recurrenceType !== 'one_off' && <p className="field-error" role="alert">{fieldErrors.endDate}</p>}
      </section>

      <section className="activity-form-section">
        <label>
          <span>{t.activities.locationLabel}</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t.activities.locationPlaceholder} />
        </label>
      </section>

      <section className={`activity-advanced${advancedOpen ? ' open' : ''}`}>
        <button
          type="button"
          className="activity-disclosure"
          aria-expanded={advancedOpen}
          aria-controls="activity-advanced-content"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <span>{advancedOpen ? t.activities.hideAdvanced : t.activities.addAdvanced}</span>
          <span aria-hidden="true">{advancedOpen ? '⌃' : '⌄'}</span>
        </button>

        {advancedOpen && <div id="activity-advanced-content" className="activity-advanced-content">
          <div className="activity-advanced-grid">
            <label>
              <span>{t.activities.categoryLabel}</span>
              <select value={category} onChange={(event) => { setCategory(event.target.value as ActivityCategory); setCategoryTouched(true) }}>
                {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {(kind === 'club' || skillLevel) && <label>
              <span>{t.activities.skillLevelCompactLabel}</span>
              <input value={skillLevel} onChange={(event) => setSkillLevel(event.target.value)} placeholder={t.activities.skillLevelPlaceholder} />
            </label>}
            {initial && <label>
              <span>{t.activities.statusLabel}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as Activity['status'])}>
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>}
          </div>

          <div className="activity-optional-group">
            <h5>{t.activities.responsibilityTitle}</h5>
            <div className="activity-advanced-grid">
              <label><span>{t.activities.responsibleCompactLabel}</span><select value={responsibleMemberId} onChange={(event) => setResponsibleMemberId(event.target.value)}><option value="">{t.activities.responsibleNone}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label>
              <label><span>{t.activities.secondaryResponsibleCompactLabel}</span><select value={secondaryResponsibleMemberId} onChange={(event) => setSecondaryResponsibleMemberId(event.target.value)}><option value="">{t.activities.responsibleNone}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label>
            </div>
          </div>

          <div className="activity-optional-group">
            <button type="button" className="activity-optional-toggle" aria-expanded={contactOpen} onClick={() => setContactOpen((open) => !open)}>
              <span>{contactOpen ? t.activities.contactAdded : t.activities.addContact}</span><span aria-hidden="true">{contactOpen ? '−' : '+'}</span>
            </button>
            {contactOpen && <div className="activity-advanced-grid activity-contact-fields">
              <label><span>{t.activities.coachNameLabel}</span><input value={coachName} onChange={(event) => setCoachName(event.target.value)} /></label>
              <label><span>{t.activities.coachPhoneLabel}</span><input type="tel" autoComplete="tel" value={coachPhone} onChange={(event) => setCoachPhone(event.target.value)} /></label>
              <label><span>{t.activities.coachEmailLabel}</span><input type="email" autoComplete="email" value={coachEmail} onChange={(event) => setCoachEmail(event.target.value)} /></label>
            </div>}
          </div>

          <div className="activity-optional-group">
            <button type="button" className="activity-optional-toggle" aria-expanded={paymentOpen} onClick={() => setPaymentOpen((open) => !open)}>
              <span>{t.activities.trackPayments}</span><span aria-hidden="true">{paymentOpen ? '−' : '+'}</span>
            </button>
            {paymentOpen && <div className="activity-advanced-grid activity-payment-fields">
              <label><span>{t.activities.paymentAmountLabel}</span><input type="number" min="0" step="0.01" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
              <label><span>{t.activities.paymentFrequencyLabel}</span><select value={paymentFrequency} onChange={(event) => setPaymentFrequency(event.target.value as ActivityPaymentFrequency | '')}><option value="">{t.activities.noPaymentFrequency}</option>{PAYMENT_FREQUENCY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label><span>{t.activities.nextPaymentDueDateLabel}</span><input type="date" value={nextPaymentDueDate} onChange={(event) => setNextPaymentDueDate(event.target.value)} /></label>
            </div>}
          </div>

          <div className="activity-optional-group">
            <label className="compact-switch activity-reminder-toggle">
              <input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />
              <span>{t.activities.reminderCompactLabel}</span>
            </label>
            {reminderEnabled && <label><span>{t.activities.reminderDaysBeforeLabel}</span><input type="number" min="0" step="1" inputMode="numeric" value={reminderDaysBefore} onChange={(event) => setReminderDaysBefore(event.target.value)} /></label>}
          </div>

          <label className="activity-notes-field">
            <span>{t.activities.notesLabel}</span>
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>}
      </section>
    </div>

    <div className="activity-form-footer">
      {submitError && <p className="error" role="alert">{submitError}</p>}
      <button type="submit" disabled={loading}>{loading ? t.activities.submitting : initial ? t.activities.submitSave : t.activities.submitAdd}</button>
    </div>
  </form>
}

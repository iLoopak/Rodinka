import { useState } from 'react'
import { t } from '../strings'
import { todayISODate } from '../utils/dueDate'
import {
  MEDICAL_RECORD_TYPE_VALUES,
  MEDICAL_STATUS_VALUES,
  medicalRecordTypeLabel,
  medicalStatusLabel,
} from '../utils/medicalLabels'
import type { MedicalRecordInput } from '../domain/medical/types'
import type { MedicalRecord, MedicalRecordType, MedicalStatus } from '../hooks/useMedicalRecords'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { DateShortcutField, GuidedDisclosure, GuidedLead, MemberChoicePicker } from './create-record/GuidedCreateFields'

const RECORD_TYPE_OPTIONS = MEDICAL_RECORD_TYPE_VALUES.map((value) => ({
  value,
  label: medicalRecordTypeLabel(value),
}))
const STATUS_OPTIONS = MEDICAL_STATUS_VALUES.map((value) => ({ value, label: medicalStatusLabel(value) }))

interface Props {
  members: FamilyMember[]
  currentMemberId: string
  initial?: MedicalRecord
  initialRecordDate?: string
  initialMemberId?: string
  variant?: 'standard' | 'guided'
  onSubmit: (input: MedicalRecordInput) => Promise<void>
}

export function AddMedicalRecordForm({ members, currentMemberId, initial, initialRecordDate, initialMemberId, variant = 'standard', onSubmit }: Props) {
  const initialPatientId = initialMemberId && members.some((member) => member.id === initialMemberId)
    ? initialMemberId
    : members[0]?.id ?? currentMemberId
  const [patientId, setPatientId] = useState(initial?.patient_id ?? initialPatientId)
  const [responsibleMemberId, setResponsibleMemberId] = useState(initial?.responsible_member_id ?? '')
  const [recordType, setRecordType] = useState<MedicalRecordType>(initial?.record_type ?? 'checkup')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [provider, setProvider] = useState(initial?.provider ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [recordDate, setRecordDate] = useState(initial?.record_date ?? initialRecordDate ?? todayISODate())
  const [startTime, setStartTime] = useState(initial?.start_time ?? '')
  const [endTime, setEndTime] = useState(initial?.end_time ?? '')
  const [status, setStatus] = useState<MedicalStatus>(initial?.status ?? 'planned')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [nextDueDate, setNextDueDate] = useState(initial?.next_due_date ?? '')
  const [recurrenceIntervalMonths, setRecurrenceIntervalMonths] = useState(
    initial?.recurrence_interval_months != null ? String(initial.recurrence_interval_months) : ''
  )
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminder_enabled ?? false)
  const [reminderDaysBefore, setReminderDaysBefore] = useState(
    initial?.reminder_days_before != null ? String(initial.reminder_days_before) : ''
  )
  const [vaccineName, setVaccineName] = useState(initial?.vaccine_name ?? '')
  const [vaccineDoseNumber, setVaccineDoseNumber] = useState(
    initial?.vaccine_dose_number != null ? String(initial.vaccine_dose_number) : ''
  )
  const [vaccineBatchNumber, setVaccineBatchNumber] = useState(initial?.vaccine_batch_number ?? '')
  const [vaccineCompletedDate, setVaccineCompletedDate] = useState(initial?.vaccine_completed_date ?? '')
  const [vaccineNextDoseDate, setVaccineNextDoseDate] = useState(initial?.vaccine_next_dose_date ?? '')

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!patientId || !members.some((m) => m.id === patientId)) {
      setError(t.medical.errors.patientRequired)
      return
    }
    if (!recordDate) {
      setError(t.medical.errors.recordDateRequired)
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        patientId,
        responsibleMemberId: responsibleMemberId || null,
        recordType,
        title: variant === 'guided' && !initial ? title.trim() || medicalRecordTypeLabel(recordType) : title,
        provider,
        location,
        recordDate,
        startTime: startTime || null,
        endTime: endTime || null,
        status,
        notes,
        nextDueDate: nextDueDate || null,
        recurrenceIntervalMonths: recurrenceIntervalMonths ? Number(recurrenceIntervalMonths) : null,
        reminderEnabled,
        reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : null,
        vaccineName,
        vaccineDoseNumber: vaccineDoseNumber ? Number(vaccineDoseNumber) : null,
        vaccineBatchNumber,
        vaccineCompletedDate: vaccineCompletedDate || null,
        vaccineNextDoseDate: vaccineNextDoseDate || null,
      })
    } catch (err) {
      console.error('Failed to save medical record:', err)
      setError(t.errors.generic)
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'guided' && !initial) {
    return <form className="guided-create-form" onSubmit={handleSubmit}>
      <div className="guided-create-scroll">
        <GuidedLead />
        <section className="guided-primary-section">
          <span className="guided-field-label">{t.create.guided.medicalPrompt}</span>
          <div className="guided-option-grid" role="group" aria-label={t.medical.recordTypeLabel}>
            {RECORD_TYPE_OPTIONS.map((option) => <button
              key={option.value}
              type="button"
              className={recordType === option.value ? 'selected' : ''}
              aria-pressed={recordType === option.value}
              onClick={() => setRecordType(option.value)}
            >{option.label}</button>)}
          </div>
        </section>

        <MemberChoicePicker
          label={t.medical.patientLabel}
          members={members}
          value={patientId}
          required
          onChange={setPatientId}
        />

        <DateShortcutField label={t.create.guided.medicalDate} value={recordDate} required onChange={setRecordDate} />
        <label className="guided-compact-field">
          <span>{t.medical.startTimeLabel}</span>
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>

        <GuidedDisclosure open={detailsOpen} onToggle={() => setDetailsOpen((open) => !open)}>
          <label>
            <span>{t.create.guided.medicalCustomTitle}</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.medical.titlePlaceholder} />
            <small>{t.create.guided.medicalCustomTitleHint}</small>
          </label>
          <div className="guided-two-column">
            <label><span>{t.medical.providerLabel}</span><input value={provider} onChange={(event) => setProvider(event.target.value)} /></label>
            <label><span>{t.medical.locationLabel}</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
          </div>
          <MemberChoicePicker label={t.medical.responsibleLabel} members={members} value={responsibleMemberId} emptyLabel={t.medical.responsibleNone} onChange={setResponsibleMemberId} />
          <div className="guided-two-column">
            <label><span>{t.medical.endTimeLabel}</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            <label><span>{t.medical.statusLabel}</span><select value={status} onChange={(event) => setStatus(event.target.value as MedicalStatus)}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label><span>{t.medical.nextDueDateLabel}</span><input type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} /></label>
            <label><span>{t.medical.recurrenceIntervalLabel}</span><input type="number" min="0" step="1" inputMode="numeric" value={recurrenceIntervalMonths} onChange={(event) => setRecurrenceIntervalMonths(event.target.value)} /></label>
          </div>
          {recordType === 'vaccination' && <div className="guided-subsection">
            <h4>{t.medical.sectionVaccination}</h4>
            <div className="guided-two-column">
              <label><span>{t.medical.vaccineNameLabel}</span><input value={vaccineName} onChange={(event) => setVaccineName(event.target.value)} /></label>
              <label><span>{t.medical.vaccineDoseNumberLabel}</span><input type="number" min="1" step="1" inputMode="numeric" value={vaccineDoseNumber} onChange={(event) => setVaccineDoseNumber(event.target.value)} /></label>
              <label><span>{t.medical.vaccineCompletedDateLabel}</span><input type="date" value={vaccineCompletedDate} onChange={(event) => setVaccineCompletedDate(event.target.value)} /></label>
              <label><span>{t.medical.vaccineNextDoseDateLabel}</span><input type="date" value={vaccineNextDoseDate} onChange={(event) => setVaccineNextDoseDate(event.target.value)} /></label>
              <label className="guided-full-width"><span>{t.medical.vaccineBatchNumberLabel}</span><input value={vaccineBatchNumber} onChange={(event) => setVaccineBatchNumber(event.target.value)} /></label>
            </div>
          </div>}
          <label className="guided-switch">
            <input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />
            <span>{t.medical.reminderEnabledLabel}</span>
          </label>
          {reminderEnabled && <label><span>{t.medical.reminderDaysBeforeLabel}</span><input type="number" min="0" step="1" inputMode="numeric" value={reminderDaysBefore} onChange={(event) => setReminderDaysBefore(event.target.value)} /></label>}
          <label><span>{t.medical.notesLabel}</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </GuidedDisclosure>
      </div>
      <div className="guided-create-footer">
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? t.medical.submitting : t.medical.submitAdd}</button>
      </div>
    </form>
  }

  return (
    <form className="sectioned-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <h4>{t.medical.sectionPatient}</h4>
        <label>
          {t.medical.patientLabel}
          <select required value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.medical.responsibleLabel}
          <select value={responsibleMemberId} onChange={(e) => setResponsibleMemberId(e.target.value)}>
            <option value="">{t.medical.responsibleNone}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.medical.recordTypeLabel}
          <select value={recordType} onChange={(e) => setRecordType(e.target.value as MedicalRecordType)}>
            {RECORD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.medical.titleLabel}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.medical.titlePlaceholder}
          />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.medical.sectionAppointment}</h4>
        <label>
          {t.medical.recordDateLabel}
          <input required type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
        </label>
        <label>
          {t.medical.startTimeLabel}
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label>
          {t.medical.endTimeLabel}
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
        <label>
          {t.medical.statusLabel}
          <select value={status} onChange={(e) => setStatus(e.target.value as MedicalStatus)}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-section">
        <h4>{t.medical.sectionProvider}</h4>
        <label>
          {t.medical.providerLabel}
          <input value={provider} onChange={(e) => setProvider(e.target.value)} />
        </label>
        <label>
          {t.medical.locationLabel}
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.medical.sectionFollowUp}</h4>
        <label>
          {t.medical.nextDueDateLabel}
          <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        </label>
        <label>
          {t.medical.recurrenceIntervalLabel}
          <input
            type="number"
            min="0"
            step="1"
            value={recurrenceIntervalMonths}
            onChange={(e) => setRecurrenceIntervalMonths(e.target.value)}
          />
        </label>
      </div>

      {recordType === 'vaccination' && (
        <div className="form-section">
          <h4>{t.medical.sectionVaccination}</h4>
          <label>
            {t.medical.vaccineNameLabel}
            <input value={vaccineName} onChange={(e) => setVaccineName(e.target.value)} />
          </label>
          <label>
            {t.medical.vaccineDoseNumberLabel}
            <input
              type="number"
              min="1"
              step="1"
              value={vaccineDoseNumber}
              onChange={(e) => setVaccineDoseNumber(e.target.value)}
            />
          </label>
          <label>
            {t.medical.vaccineBatchNumberLabel}
            <input value={vaccineBatchNumber} onChange={(e) => setVaccineBatchNumber(e.target.value)} />
          </label>
          <label>
            {t.medical.vaccineCompletedDateLabel}
            <input
              type="date"
              value={vaccineCompletedDate}
              onChange={(e) => setVaccineCompletedDate(e.target.value)}
            />
          </label>
          <label>
            {t.medical.vaccineNextDoseDateLabel}
            <input
              type="date"
              value={vaccineNextDoseDate}
              onChange={(e) => setVaccineNextDoseDate(e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="form-section">
        <h4>{t.medical.sectionNotes}</h4>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={reminderEnabled}
            onChange={(e) => setReminderEnabled(e.target.checked)}
          />
          {t.medical.reminderEnabledLabel}
        </label>
        {reminderEnabled && (
          <label>
            {t.medical.reminderDaysBeforeLabel}
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
          {t.medical.notesLabel}
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? t.medical.submitting : initial ? t.medical.submitSave : t.medical.submitAdd}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}

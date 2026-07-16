import { useState } from 'react'
import { t } from '../strings'
import { formatFullDate } from '../utils/dueDate'
import { medicalRecordTypeLabel, medicalStatusLabel } from '../utils/medicalLabels'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { MedicalRecordInput } from '../domain/medical/types'
import { Modal } from './ui/Modal'
import { AddMedicalRecordForm } from './AddMedicalRecordForm'
import { ShareLinkButton } from './ui/ShareLinkButton'
import { PersonRoleGroup, type PersonRole } from './ui/PersonRoleGroup'

interface Props {
  record: MedicalRecord
  members: FamilyMember[]
  currentMemberId: string
  memberName: (id: string) => string
  memberById: (id: string) => FamilyMember | undefined
  onUpdate: (id: string, input: MedicalRecordInput) => Promise<void>
  onClose: () => void
}

export function recordToInput(record: MedicalRecord): MedicalRecordInput {
  return {
    patientId: record.patient_id,
    responsibleMemberId: record.responsible_member_id,
    recordType: record.record_type,
    title: record.title,
    provider: record.provider ?? '',
    location: record.location ?? '',
    recordDate: record.record_date,
    startTime: record.start_time,
    endTime: record.end_time,
    status: record.status,
    notes: record.notes ?? '',
    nextDueDate: record.next_due_date,
    recurrenceIntervalMonths: record.recurrence_interval_months,
    reminderEnabled: record.reminder_enabled,
    reminderDaysBefore: record.reminder_days_before,
    vaccineName: record.vaccine_name ?? '',
    vaccineDoseNumber: record.vaccine_dose_number,
    vaccineBatchNumber: record.vaccine_batch_number ?? '',
    vaccineCompletedDate: record.vaccine_completed_date,
    vaccineNextDoseDate: record.vaccine_next_dose_date,
  }
}

export function MedicalDetailModal({ record, members, currentMemberId, memberName, memberById, onUpdate, onClose }: Props) {
  const [editing, setEditing] = useState(false)
  const [markingComplete, setMarkingComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (editing) {
    return (
      <Modal title={t.medical.editTitle} onClose={onClose}>
        <AddMedicalRecordForm
          members={members}
          currentMemberId={currentMemberId}
          initial={record}
          onSubmit={async (input) => {
            await onUpdate(record.id, input)
            onClose()
          }}
        />
      </Modal>
    )
  }

  async function handleMarkCompleted() {
    setMarkingComplete(true)
    setError(null)
    try {
      await onUpdate(record.id, { ...recordToInput(record), status: 'completed' })
      onClose()
    } catch {
      setError(t.errors.generic)
    } finally {
      setMarkingComplete(false)
    }
  }

  const providerLine = [record.provider, record.location].filter(Boolean).join(' · ')
  const vaccineLine = [
    record.vaccine_name,
    record.vaccine_dose_number ? `#${record.vaccine_dose_number}` : null,
    record.vaccine_next_dose_date ? formatFullDate(record.vaccine_next_dose_date) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const patient = memberById(record.patient_id)
  const responsible = record.responsible_member_id
    ? memberById(record.responsible_member_id)
    : undefined
  const peopleRoles: PersonRole[] = [
    { member: patient, fallbackName: memberName(record.patient_id), label: t.common.patient },
    ...(record.responsible_member_id ? [{ member: responsible, fallbackName: memberName(record.responsible_member_id), label: t.common.responsibleAdult }] : []),
  ]

  return (
    <Modal title={record.title} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta">
          {medicalRecordTypeLabel(record.record_type)} · {medicalStatusLabel(record.status)}
        </p>

        <PersonRoleGroup roles={peopleRoles} />

        <p className="row-meta">
          {formatFullDate(record.record_date)}
          {record.start_time ? ` · ${record.start_time}` : ''}
        </p>
        {providerLine && <p className="row-meta">{providerLine}</p>}
        {record.next_due_date && (
          <p className="row-meta">
            {t.medical.nextDueDateLabel}: {formatFullDate(record.next_due_date)}
          </p>
        )}
        {record.record_type === 'vaccination' && vaccineLine && <p className="row-meta">{vaccineLine}</p>}
        {record.notes && <p className="row-description">{record.notes}</p>}
      </div>

      <div className="family-actions">
        {record.status === 'planned' && (
          <button onClick={handleMarkCompleted} disabled={markingComplete}>
            {markingComplete ? t.medical.submitting : t.medical.markCompleted}
          </button>
        )}
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          {t.medical.edit}
        </button>
        <ShareLinkButton route="/health" param="record" id={record.id} title={record.title} />
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  )
}

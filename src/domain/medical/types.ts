import type { MedicalRecordType, MedicalStatus } from '../../hooks/useMedicalRecords'

export interface MedicalRecordInput {
  patientId: string
  responsibleMemberId: string | null
  recordType: MedicalRecordType
  title: string
  provider: string
  location: string
  recordDate: string
  startTime: string | null
  endTime: string | null
  status: MedicalStatus
  notes: string
  nextDueDate: string | null
  recurrenceIntervalMonths: number | null
  reminderEnabled: boolean
  reminderDaysBefore: number | null
  vaccineName: string
  vaccineDoseNumber: number | null
  vaccineBatchNumber: string
  vaccineCompletedDate: string | null
  vaccineNextDoseDate: string | null
}

export function medicalInputToRow(input: MedicalRecordInput) {
  return {
    patient_id: input.patientId,
    responsible_member_id: input.responsibleMemberId,
    record_type: input.recordType,
    title: input.title,
    provider: input.provider || null,
    location: input.location || null,
    record_date: input.recordDate,
    start_time: input.startTime,
    end_time: input.endTime,
    status: input.status,
    notes: input.notes || null,
    next_due_date: input.nextDueDate,
    recurrence_interval_months: input.recurrenceIntervalMonths,
    reminder_enabled: input.reminderEnabled,
    reminder_days_before: input.reminderDaysBefore,
    vaccine_name: input.vaccineName || null,
    vaccine_dose_number: input.vaccineDoseNumber,
    vaccine_batch_number: input.vaccineBatchNumber || null,
    vaccine_completed_date: input.vaccineCompletedDate,
    vaccine_next_dose_date: input.vaccineNextDoseDate,
  }
}

import { t } from '../strings'
import type { MedicalRecordType, MedicalStatus } from '../hooks/useMedicalRecords'

export const MEDICAL_RECORD_TYPE_VALUES: MedicalRecordType[] = [
  'checkup',
  'pediatrician',
  'gp',
  'dentist',
  'specialist',
  'vaccination',
  'screening',
  'other',
]

export function medicalRecordTypeLabel(type: MedicalRecordType): string {
  const labels: Record<MedicalRecordType, string> = {
    checkup: t.medical.typeCheckup,
    pediatrician: t.medical.typePediatrician,
    gp: t.medical.typeGp,
    dentist: t.medical.typeDentist,
    specialist: t.medical.typeSpecialist,
    vaccination: t.medical.typeVaccination,
    screening: t.medical.typeScreening,
    other: t.medical.typeOther,
  }
  return labels[type]
}

export const MEDICAL_STATUS_VALUES: MedicalStatus[] = ['planned', 'completed', 'cancelled']

export function medicalStatusLabel(status: MedicalStatus): string {
  const labels: Record<MedicalStatus, string> = {
    planned: t.medical.statusPlanned,
    completed: t.medical.statusCompleted,
    cancelled: t.medical.statusCancelled,
  }
  return labels[status]
}

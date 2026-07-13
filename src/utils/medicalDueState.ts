import { compareISODates, todayISODate } from './dueDate'
import type { MedicalRecord } from '../hooks/useMedicalRecords'

function isPast(date: string, today: string): boolean {
  return compareISODates(date, today) < 0
}

// A record needs attention if a planned visit's date has passed without
// being resolved, or if any of its "next due" dates have passed. Shared
// by the Health screen's Overdue tab and the Today dashboard summary so
// the definition can't drift between the two.
export function isMedicalRecordOverdue(record: MedicalRecord, today: string = todayISODate()): boolean {
  if (record.status === 'planned' && isPast(record.record_date, today)) return true
  if (record.next_due_date && isPast(record.next_due_date, today)) return true
  if (record.vaccine_next_dose_date && isPast(record.vaccine_next_dose_date, today)) return true
  return false
}

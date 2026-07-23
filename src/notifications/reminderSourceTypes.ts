// Structural source types used by the reminder engine. This module is kept
// deliberately independent of React hooks so it can be bundled by Deno.
export type ReminderLocale = 'cs' | 'en'

export interface ReminderFamilyMember {
  id: string
  display_name: string
  role: 'admin' | 'parent' | 'child'
}

export interface ReminderChoreCompletion {
  id: string
  status: 'pending_approval' | 'approved' | 'rejected'
  occurrence_due_date: string
  chore_title: string
}

export interface ReminderActivity {
  id: string
  title: string
  status: 'active' | 'paused' | 'finished'
  child_id: string | null
  participant_ids: string[]
  responsible_member_id: string | null
  start_date: string
  end_date: string | null
  recurrence_type: 'one_off' | 'weekly' | 'biweekly' | 'custom_weekdays'
  recurrence_weekdays: number[] | null
  reminder_enabled: boolean
  reminder_days_before: number | null
  next_payment_due_date: string | null
  payment_paid_for_date: string | null
}

export interface ReminderMedicalRecord {
  id: string
  patient_id: string | null
  responsible_member_id: string | null
  record_type: string
  record_date: string
  status: 'planned' | 'completed' | 'cancelled'
  vaccine_next_dose_date: string | null
}

export interface ReminderMealVoteRound {
  id: string
  title: string
  status: 'draft' | 'open' | 'closed'
  deadline_at: string | null
  candidates: Array<{ votes: Array<{ member_id: string }> }>
}

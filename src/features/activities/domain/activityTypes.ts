/**
 * Activities domain types.
 *
 * Moved out of `hooks/useActivities.ts`: the shape of the domain belongs to
 * the domain, not to whichever loader happened to select it. Field names still
 * mirror the Postgres columns for the same reason as meals — `Activity` is
 * embedded in the persisted calendar snapshot and read by the planner, Today
 * and the reminder sources. See P2-M2 in the data layer audit.
 */

export type ActivityCategory =
  | 'swimming'
  | 'dance'
  | 'football'
  | 'music'
  | 'speech_therapy'
  | 'club'
  | 'camp'
  | 'after_school'
  | 'other'
  | 'vacation'
  | 'trip'
  | 'celebration'
  | 'family_visit'
  | 'other_event'

export type ActivityKind = 'club' | 'event'

export type ActivityRecurrenceType = 'one_off' | 'weekly' | 'biweekly' | 'custom_weekdays'
export type ActivityPaymentFrequency = 'one_time' | 'weekly' | 'monthly' | 'term' | 'yearly'
export type ActivityStatus = 'active' | 'paused' | 'finished'

export interface Activity {
  id: string
  family_id: string
  title: string
  category: ActivityCategory
  kind: ActivityKind
  all_day: boolean
  child_id: string | null
  participant_ids: string[]
  responsible_member_id: string | null
  secondary_responsible_member_id: string | null
  location: string | null
  coach_name: string | null
  coach_phone: string | null
  coach_email: string | null
  notes: string | null
  skill_level: string | null
  start_date: string
  end_date: string | null
  recurrence_type: ActivityRecurrenceType
  // ISO weekday numbers 1 (Mon) .. 7 (Sun); only meaningful for 'custom_weekdays'.
  recurrence_weekdays: number[] | null
  start_time: string | null
  end_time: string | null
  payment_amount: number | null
  payment_frequency: ActivityPaymentFrequency | null
  next_payment_due_date: string | null
  payment_paid_at: string | null
  payment_paid_for_date: string | null
  status: ActivityStatus
  reminder_enabled: boolean
  reminder_days_before: number | null
  created_at: string
  updated_at: string
}

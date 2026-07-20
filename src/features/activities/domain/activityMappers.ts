import type { Activity } from './activityTypes'
import type {
  ActivityParticipantHistory,
  OccurrenceOverride,
  SeriesAssignmentHistory,
} from '../../../utils/occurrenceAssignments'

/**
 * One definition of each activities/occurrence aggregate.
 *
 * All four of these column lists were previously written out twice — once in
 * the feature loader and once in `calendarSync.fetchCalendarSnapshot`. They
 * matched by hand, not by construction, and the first time someone added a
 * column to one and not the other the calendar and the activities screen would
 * have disagreed about the same row. Audit finding P1-M1.
 */

export const ACTIVITY_COLUMNS =
  'id, family_id, title, category, kind, all_day, child_id, responsible_member_id, secondary_responsible_member_id, location, coach_name, coach_phone, coach_email, notes, skill_level, start_date, end_date, recurrence_type, recurrence_weekdays, start_time, end_time, payment_amount, payment_frequency, next_payment_due_date, payment_paid_at, payment_paid_for_date, status, reminder_enabled, reminder_days_before, created_at, updated_at, activity_participants(member_id)'

export const OCCURRENCE_OVERRIDE_COLUMNS =
  'id, family_id, series_type, series_id, occurrence_date, companion_member_id, assignee_member_id, cancelled, updated_at'

export const SERIES_ASSIGNMENT_HISTORY_COLUMNS =
  'id, family_id, series_type, series_id, effective_from, member_id'

export const ACTIVITY_PARTICIPANT_HISTORY_COLUMNS =
  'id, family_id, activity_id, member_id, effective_from, effective_to'

type Row = Record<string, unknown>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const nullableText = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null
const flag = (value: unknown): boolean => value === true

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** ISO weekday numbers; anything unparseable is dropped rather than trusted. */
const weekdays = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null
  const parsed = value.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 7)
  return parsed.length > 0 ? parsed : null
}

/**
 * `participant_ids` is a client-side join onto activity_participants — a raw
 * activities row never carries it. Callers that patch an activity from a
 * realtime row pass the participants they already hold.
 */
export function mapActivity(row: Row, participantIds?: string[]): Activity {
  const joined = Array.isArray(row.activity_participants)
    ? (row.activity_participants as Row[]).map((participant) => text(participant.member_id)).filter(Boolean)
    : null

  return {
    id: text(row.id),
    family_id: text(row.family_id),
    title: text(row.title),
    category: (row.category ?? 'other') as Activity['category'],
    kind: (row.kind ?? 'club') as Activity['kind'],
    all_day: flag(row.all_day),
    child_id: nullableText(row.child_id),
    participant_ids: participantIds ?? joined ?? [],
    responsible_member_id: nullableText(row.responsible_member_id),
    secondary_responsible_member_id: nullableText(row.secondary_responsible_member_id),
    location: nullableText(row.location),
    coach_name: nullableText(row.coach_name),
    coach_phone: nullableText(row.coach_phone),
    coach_email: nullableText(row.coach_email),
    notes: nullableText(row.notes),
    skill_level: nullableText(row.skill_level),
    start_date: text(row.start_date),
    end_date: nullableText(row.end_date),
    recurrence_type: (row.recurrence_type ?? 'one_off') as Activity['recurrence_type'],
    recurrence_weekdays: weekdays(row.recurrence_weekdays),
    start_time: nullableText(row.start_time),
    end_time: nullableText(row.end_time),
    // Postgres numeric arrives as a string; a forgotten conversion here makes
    // payment comparisons silently wrong rather than loudly broken.
    payment_amount: nullableNumber(row.payment_amount),
    payment_frequency: (nullableText(row.payment_frequency) ?? null) as Activity['payment_frequency'],
    next_payment_due_date: nullableText(row.next_payment_due_date),
    payment_paid_at: nullableText(row.payment_paid_at),
    payment_paid_for_date: nullableText(row.payment_paid_for_date),
    status: (row.status ?? 'active') as Activity['status'],
    reminder_enabled: flag(row.reminder_enabled),
    reminder_days_before: nullableNumber(row.reminder_days_before),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  }
}

export function mapOccurrenceOverride(row: Row): OccurrenceOverride {
  return {
    id: text(row.id),
    family_id: text(row.family_id),
    series_type: (row.series_type ?? 'activity') as OccurrenceOverride['series_type'],
    series_id: text(row.series_id),
    occurrence_date: text(row.occurrence_date),
    companion_member_id: nullableText(row.companion_member_id),
    assignee_member_id: nullableText(row.assignee_member_id),
    cancelled: flag(row.cancelled),
    updated_at: text(row.updated_at),
  }
}

export function mapSeriesAssignmentHistory(row: Row): SeriesAssignmentHistory {
  return {
    id: text(row.id),
    family_id: text(row.family_id),
    series_type: (row.series_type ?? 'activity') as SeriesAssignmentHistory['series_type'],
    series_id: text(row.series_id),
    effective_from: text(row.effective_from),
    member_id: nullableText(row.member_id),
  }
}

export function mapActivityParticipantHistory(row: Row): ActivityParticipantHistory {
  return {
    id: text(row.id),
    family_id: text(row.family_id),
    activity_id: text(row.activity_id),
    member_id: text(row.member_id),
    effective_from: text(row.effective_from),
    effective_to: nullableText(row.effective_to),
  }
}

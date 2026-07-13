import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { Activity } from '../hooks/useActivities'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import type { MealPlanEntry } from '../hooks/useMealPlanEntries'
import type { CalendarItemType } from './itemTypeStyle'
import { classifyDueDate, compareISODates, todayISODate, type DueUrgency } from './dueDate'
import { expandActivitiesOccurrences } from './recurrence'
import { displayTitle } from './mealPlanGrouping'

export interface CalendarEntry {
  id: string
  type: CalendarItemType
  date: string
  time: string | null
  title: string
  subtitle: string | null
  /** The child/patient this entry is about, if any. */
  childOrPatientId: string | null
  /** The accompanying/responsible adult, or the chore assignee. */
  responsibleMemberId: string | null
  recurring: boolean
  /** What kind of source record this was derived from, for navigation. */
  sourceType: 'chore' | 'activity' | 'activity_payment' | 'medical' | 'medical_due' | 'meal'
  sourceId: string
}

function withinRange(date: string, rangeStart: string, rangeEnd: string): boolean {
  return compareISODates(date, rangeStart) >= 0 && compareISODates(date, rangeEnd) <= 0
}

interface BuildCalendarEntriesInput {
  chores: Chore[]
  activities: Activity[]
  medicalRecords: MedicalRecord[]
  // Optional and additive: meal plan entries were not part of the original
  // calendar projection (Phase 2). Only 'confirmed'/'completed' entries are
  // projected — 'proposed'/'skipped' stay out to avoid flooding the
  // calendar with every rough meal idea (see the Phase 3 PR description
  // for the full reasoning). Omitting this field entirely is equivalent to
  // passing an empty array.
  mealPlanEntries?: MealPlanEntry[]
  rangeStart: string
  rangeEnd: string
}

// Projects the source records (chores/activities/medical records/meal
// plan entries) into a flat, sorted list of calendar entries for a
// bounded date range. Nothing is persisted or cached — this is
// recomputed on every call, so it always reflects the current source
// data. Callers are expected to pre-filter the source arrays for any
// status-based exclusion (e.g. hiding completed chores) since what
// counts as "done" differs per record type.
export function buildCalendarEntries({
  chores,
  activities,
  medicalRecords,
  mealPlanEntries = [],
  rangeStart,
  rangeEnd,
}: BuildCalendarEntriesInput): CalendarEntry[] {
  const entries: CalendarEntry[] = []

  for (const chore of chores) {
    if (!withinRange(chore.due_date, rangeStart, rangeEnd)) continue
    entries.push({
      id: `chore:${chore.id}`,
      type: 'chore',
      date: chore.due_date,
      time: null,
      title: chore.title,
      subtitle: null,
      childOrPatientId: chore.assigned_to,
      responsibleMemberId: chore.assigned_to,
      recurring: chore.recurring,
      sourceType: 'chore',
      sourceId: chore.id,
    })
  }

  const activityById = new Map(activities.map((a) => [a.id, a]))
  for (const occurrence of expandActivitiesOccurrences(activities, rangeStart, rangeEnd)) {
    const activity = activityById.get(occurrence.activityId)
    if (!activity) continue
    entries.push({
      id: `activity:${occurrence.id}`,
      type: 'activity',
      date: occurrence.date,
      time: activity.start_time,
      title: activity.title,
      subtitle: activity.location,
      childOrPatientId: activity.child_id,
      responsibleMemberId: activity.responsible_member_id,
      recurring: activity.recurrence_type !== 'one_off',
      sourceType: 'activity',
      sourceId: activity.id,
    })
  }

  for (const activity of activities) {
    if (!activity.next_payment_due_date) continue
    if (!withinRange(activity.next_payment_due_date, rangeStart, rangeEnd)) continue
    entries.push({
      id: `activity-payment:${activity.id}`,
      type: 'payment',
      date: activity.next_payment_due_date,
      time: null,
      title: t.calendar.paymentTitle(activity.title),
      subtitle: null,
      childOrPatientId: activity.child_id,
      responsibleMemberId: activity.responsible_member_id,
      recurring: false,
      sourceType: 'activity_payment',
      sourceId: activity.id,
    })
  }

  for (const record of medicalRecords) {
    const entryType: CalendarItemType = record.record_type === 'vaccination' ? 'vaccination' : 'medical'

    if (withinRange(record.record_date, rangeStart, rangeEnd)) {
      entries.push({
        id: `medical:${record.id}`,
        type: entryType,
        date: record.record_date,
        time: record.start_time,
        title: record.title,
        subtitle: record.provider,
        childOrPatientId: record.patient_id,
        responsibleMemberId: record.responsible_member_id,
        recurring: false,
        sourceType: 'medical',
        sourceId: record.id,
      })
    }

    const nextDue = record.record_type === 'vaccination' ? record.vaccine_next_dose_date : record.next_due_date
    if (nextDue && withinRange(nextDue, rangeStart, rangeEnd)) {
      entries.push({
        id: `medical-due:${record.id}`,
        type: entryType,
        date: nextDue,
        time: null,
        title: t.calendar.dueTitle(record.title),
        subtitle: record.provider,
        childOrPatientId: record.patient_id,
        responsibleMemberId: record.responsible_member_id,
        recurring: false,
        sourceType: 'medical_due',
        sourceId: record.id,
      })
    }
  }

  for (const entry of mealPlanEntries) {
    if (entry.status !== 'confirmed' && entry.status !== 'completed') continue
    if (!withinRange(entry.entry_date, rangeStart, rangeEnd)) continue
    entries.push({
      id: `meal:${entry.id}`,
      type: 'meal',
      date: entry.entry_date,
      time: null,
      title: displayTitle(entry, '—'),
      subtitle: null,
      childOrPatientId: null,
      responsibleMemberId: entry.responsible_member_id,
      recurring: false,
      sourceType: 'meal',
      sourceId: entry.id,
    })
  }

  return entries.sort(compareEntries)
}

function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  const dateCompare = compareISODates(a.date, b.date)
  if (dateCompare !== 0) return dateCompare
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
  if (a.time && !b.time) return -1
  if (!a.time && b.time) return 1
  return a.title.localeCompare(b.title)
}

export interface AgendaGroup {
  bucket: DueUrgency
  label: string
  entries: CalendarEntry[]
}

const AGENDA_BUCKET_ORDER: DueUrgency[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'upcoming']

// Groups already-projected entries into the overdue/today/tomorrow/this
// week/later buckets used by the agenda view.
export function groupEntriesForAgenda(
  entries: CalendarEntry[],
  today: string = todayISODate()
): AgendaGroup[] {
  const buckets: Record<DueUrgency, CalendarEntry[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    upcoming: [],
  }
  for (const entry of entries) {
    buckets[classifyDueDate(entry.date, today)].push(entry)
  }

  const labels: Record<DueUrgency, string> = {
    overdue: t.due.overdue,
    today: t.due.today,
    tomorrow: t.due.tomorrow,
    thisWeek: t.due.thisWeek,
    upcoming: t.calendar.later,
  }

  return AGENDA_BUCKET_ORDER.filter((bucket) => buckets[bucket].length > 0).map((bucket) => ({
    bucket,
    label: labels[bucket],
    entries: buckets[bucket],
  }))
}

import { t } from '../strings'
import type { Chore } from '../hooks/useChores'
import type { Activity } from '../hooks/useActivities'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import type { MealPlanEntry, MealSlot } from '../hooks/useMealPlanEntries'
import type { CalendarItemType } from './itemTypeStyle'
import type { AllowancePlan } from '../hooks/useAllowancePlans'
import { classifyDueDate, compareISODates, todayISODate, type DueUrgency } from './dueDate'
import { nextPayoutDate } from './allowanceCycles'
import { expandActivitiesOccurrences } from './recurrence'
import { displayTitle } from './mealPlanGrouping'
import { getEffectiveActivityParticipants, getEffectiveOccurrenceMember, type ActivityParticipantHistory, type OccurrenceOverride, type SeriesAssignmentHistory } from './occurrenceAssignments'
import { activityRecurrenceLabel, activityWeekdaysSummary } from './activityLabels'
import { isoWeekday } from './activityFormModel'
import { choreRecurrenceSummary } from './choreRecurrence'

export interface CalendarEntry {
  id: string
  type: CalendarItemType
  date: string
  time: string | null
  endTime?: string | null
  allDay?: boolean
  title: string
  subtitle: string | null
  location?: string | null
  completed?: boolean
  /** The child/patient this entry is about, if any. */
  childOrPatientId: string | null
  /** The accompanying/responsible adult, or the chore assignee. */
  responsibleMemberId: string | null
  defaultResponsibleMemberId?: string | null
  assignmentSeriesType?: 'activity' | 'task'
  assignmentOverridden?: boolean
  participantMemberIds?: string[]
  responsibleMemberIds?: string[]
  rangeStart?: string
  rangeEnd?: string
  isMultiDay?: boolean
  recurring: boolean
  recurrenceLabel?: string | null
  /** What kind of source record this was derived from, for navigation. */
  sourceType: 'chore' | 'activity' | 'activity_payment' | 'medical' | 'medical_due' | 'meal' | 'allowance'
  sourceId: string
  /** Meal-plan ordering metadata; present only for projected meals. */
  mealSlot?: MealSlot
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
  allowancePlans?: AllowancePlan[]
  rangeStart: string
  rangeEnd: string
  occurrenceOverrides?: OccurrenceOverride[]
  assignmentHistory?: SeriesAssignmentHistory[]
  participantHistory?: ActivityParticipantHistory[]
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
  allowancePlans = [],
  rangeStart,
  rangeEnd,
  occurrenceOverrides = [],
  assignmentHistory = [],
  participantHistory = [],
}: BuildCalendarEntriesInput): CalendarEntry[] {
  const entries: CalendarEntry[] = []

  for (const chore of chores) {
    if (!chore.due_date) continue
    if (!withinRange(chore.due_date, rangeStart, rangeEnd)) continue
    const assignment = getEffectiveOccurrenceMember({
      seriesType: 'task', seriesId: chore.id, occurrenceDate: chore.due_date,
      defaultMemberId: chore.assigned_to, overrides: occurrenceOverrides, assignmentHistory,
    })
    entries.push({
      id: `chore:${chore.id}`,
      type: 'chore',
      date: chore.due_date,
      time: null,
      allDay: false,
      title: chore.title,
      subtitle: null,
      childOrPatientId: assignment.memberId,
      responsibleMemberId: assignment.memberId,
      defaultResponsibleMemberId: chore.assigned_to,
      assignmentSeriesType: 'task',
      assignmentOverridden: assignment.isOverride,
      participantMemberIds: assignment.memberId ? [assignment.memberId] : [],
      responsibleMemberIds: assignment.memberId ? [assignment.memberId] : [],
      recurring: chore.recurring,
      recurrenceLabel: chore.recurring ? choreRecurrenceSummary(chore) : null,
      sourceType: 'chore',
      sourceId: chore.id,
    })
  }

  const activityById = new Map(activities.map((a) => [a.id, a]))
  for (const occurrence of expandActivitiesOccurrences(activities, rangeStart, rangeEnd)) {
    const activity = activityById.get(occurrence.activityId)
    if (!activity) continue
    const assignment = getEffectiveOccurrenceMember({
      seriesType: 'activity', seriesId: activity.id, occurrenceDate: occurrence.date,
      defaultMemberId: activity.responsible_member_id, overrides: occurrenceOverrides, assignmentHistory,
    })
    const participantIds = getEffectiveActivityParticipants(activity.id, occurrence.date, activity.participant_ids, participantHistory)
    entries.push({
      id: `activity:${occurrence.id}`,
      type: 'activity',
      date: occurrence.date,
      time: activity.all_day ? null : activity.start_time,
      endTime: activity.all_day ? null : activity.end_time,
      allDay: activity.all_day,
      title: activity.title,
      subtitle: activity.location,
      location: activity.location,
      childOrPatientId: participantIds[0] ?? null,
      responsibleMemberId: assignment.memberId,
      defaultResponsibleMemberId: activity.responsible_member_id,
      assignmentSeriesType: 'activity',
      assignmentOverridden: assignment.isOverride,
      participantMemberIds: participantIds,
      responsibleMemberIds: [assignment.memberId, activity.secondary_responsible_member_id].filter((id): id is string => !!id),
      rangeStart: activity.start_date,
      rangeEnd: activity.end_date ?? activity.start_date,
      isMultiDay: activity.recurrence_type === 'one_off' && !!activity.end_date && activity.end_date > activity.start_date,
      recurring: activity.recurrence_type !== 'one_off',
      recurrenceLabel: activity.recurrence_type === 'weekly'
        ? t.chores.recurrenceSummaryWeeklyByDay[isoWeekday(activity.start_date) - 1]
        : activity.recurrence_type === 'custom_weekdays'
          ? `${activityRecurrenceLabel(activity.recurrence_type)}: ${activityWeekdaysSummary(activity.recurrence_weekdays)}`
          : activity.recurrence_type === 'biweekly'
            ? activityRecurrenceLabel(activity.recurrence_type)
            : null,
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
      allDay: false,
      title: t.calendar.paymentTitle(activity.title),
      subtitle: null,
      childOrPatientId: activity.participant_ids[0] ?? activity.child_id,
      responsibleMemberId: activity.responsible_member_id,
      participantMemberIds: activity.participant_ids,
      responsibleMemberIds: [activity.responsible_member_id, activity.secondary_responsible_member_id].filter((id): id is string => !!id),
      recurring: false,
      completed: activity.payment_paid_for_date === activity.next_payment_due_date,
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
        endTime: record.end_time,
        allDay: false,
        title: record.title,
        subtitle: record.provider,
        location: record.location,
        completed: record.status === 'completed',
        childOrPatientId: record.patient_id ?? null,
        responsibleMemberId: record.responsible_member_id,
        participantMemberIds: record.patient_id ? [record.patient_id] : [],
        responsibleMemberIds: record.responsible_member_id ? [record.responsible_member_id] : [],
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
        allDay: false,
        title: t.calendar.dueTitle(record.title),
        subtitle: record.provider,
        childOrPatientId: record.patient_id ?? null,
        responsibleMemberId: record.responsible_member_id,
        participantMemberIds: record.patient_id ? [record.patient_id] : [],
        responsibleMemberIds: record.responsible_member_id ? [record.responsible_member_id] : [],
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
      allDay: false,
      title: displayTitle(entry, '—'),
      subtitle: null,
      childOrPatientId: null,
      responsibleMemberId: entry.responsible_member_id,
      participantMemberIds: [],
      responsibleMemberIds: entry.responsible_member_id ? [entry.responsible_member_id] : [],
      recurring: false,
      completed: entry.status === 'completed',
      sourceType: 'meal',
      sourceId: entry.id,
      mealSlot: entry.meal_slot,
    })
  }

  for (const plan of allowancePlans) {
    if (plan.status !== 'active') continue
    const payoutDate = nextPayoutDate(rangeStart, plan.payout_day)
    if (!withinRange(payoutDate, rangeStart, rangeEnd) || payoutDate < plan.starts_on) continue
    entries.push({
      id: `allowance:${plan.id}:${payoutDate}`,
      type: 'allowance',
      date: payoutDate,
      time: null,
      allDay: false,
      title: t.allowance.calendarTitle(plan.amount),
      subtitle: null,
      childOrPatientId: plan.member_id,
      responsibleMemberId: null,
      participantMemberIds: [plan.member_id],
      responsibleMemberIds: [],
      recurring: true,
      sourceType: 'allowance',
      sourceId: plan.id,
    })
  }

  return entries.sort(compareEntries)
}

export function entryMatchesMember(entry: CalendarEntry, memberId: string): boolean {
  return (entry.participantMemberIds ?? []).includes(memberId) ||
    (entry.responsibleMemberIds ?? []).includes(memberId) ||
    entry.childOrPatientId === memberId || entry.responsibleMemberId === memberId
}

export function deduplicateAgendaRanges(entries: CalendarEntry[]): CalendarEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (!entry.isMultiDay) return true
    const key = `${entry.sourceType}:${entry.sourceId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

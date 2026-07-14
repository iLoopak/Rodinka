import type { Activity } from '../hooks/useActivities'
import { addDays, compareISODates, daysBetweenISO, todayISODate, toUTCDate } from './dueDate'

export interface ActivityOccurrence {
  id: string
  activityId: string
  date: string
}

// Generous but bounded loop guard — even a daily cadence over a full year
// is well under this, so it only protects against a caller passing an
// unreasonably large range, not normal usage.
const MAX_OCCURRENCES_PER_ACTIVITY = 400

function isoWeekday(iso: string): number {
  const day = toUTCDate(iso).getUTCDay() // 0 (Sun) .. 6 (Sat)
  return day === 0 ? 7 : day // 1 (Mon) .. 7 (Sun)
}

function makeOccurrence(activity: Activity, date: string): ActivityOccurrence {
  return { id: `${activity.id}:${date}`, activityId: activity.id, date }
}

// Derives occurrence dates for one activity within [rangeStart, rangeEnd]
// (inclusive). Nothing is persisted — this is recomputed from the
// activity's own fields every time, so edits and pauses are reflected
// immediately with no separate sync step.
export function expandActivityOccurrences(
  activity: Activity,
  rangeStart: string,
  rangeEnd: string
): ActivityOccurrence[] {
  // Paused/finished activities don't generate occurrences on the
  // calendar — they still exist and are visible in the Activities screen.
  if (activity.status !== 'active') return []

  const windowStart =
    compareISODates(activity.start_date, rangeStart) > 0 ? activity.start_date : rangeStart
  const windowEnd =
    activity.end_date && compareISODates(activity.end_date, rangeEnd) < 0
      ? activity.end_date
      : rangeEnd

  if (compareISODates(windowStart, windowEnd) > 0) return []

  if (activity.recurrence_type === 'one_off') {
    const eventEnd = activity.end_date ?? activity.start_date
    const firstDate = compareISODates(activity.start_date, rangeStart) > 0 ? activity.start_date : rangeStart
    const lastDate = compareISODates(eventEnd, rangeEnd) < 0 ? eventEnd : rangeEnd
    if (compareISODates(firstDate, lastDate) > 0) return []
    const occurrences: ActivityOccurrence[] = []
    let cursor = firstDate
    while (compareISODates(cursor, lastDate) <= 0 && occurrences.length < MAX_OCCURRENCES_PER_ACTIVITY) {
      occurrences.push(makeOccurrence(activity, cursor))
      cursor = addDays(cursor, 1)
    }
    return occurrences
  }

  if (activity.recurrence_type === 'custom_weekdays') {
    const weekdays = new Set(activity.recurrence_weekdays ?? [])
    if (weekdays.size === 0) return []

    const occurrences: ActivityOccurrence[] = []
    let cursor = windowStart
    let guard = 0
    while (compareISODates(cursor, windowEnd) <= 0 && guard < MAX_OCCURRENCES_PER_ACTIVITY) {
      if (weekdays.has(isoWeekday(cursor))) {
        occurrences.push(makeOccurrence(activity, cursor))
      }
      cursor = addDays(cursor, 1)
      guard++
    }
    return occurrences
  }

  // weekly / biweekly: a fixed cadence anchored to start_date's weekday.
  const stepDays = activity.recurrence_type === 'weekly' ? 7 : 14
  let cursor = activity.start_date
  if (compareISODates(cursor, windowStart) < 0) {
    // Fast-forward instead of stepping one cadence at a time from a
    // possibly long-past start date.
    const daysToSkip = daysBetweenISO(cursor, windowStart)
    const steps = Math.floor(daysToSkip / stepDays)
    cursor = addDays(cursor, steps * stepDays)
  }

  const occurrences: ActivityOccurrence[] = []
  let guard = 0
  while (compareISODates(cursor, windowEnd) <= 0 && guard < MAX_OCCURRENCES_PER_ACTIVITY) {
    if (compareISODates(cursor, windowStart) >= 0) {
      occurrences.push(makeOccurrence(activity, cursor))
    }
    cursor = addDays(cursor, stepDays)
    guard++
  }
  return occurrences
}

// Earliest occurrence on or after `today`, looking up to `horizonDays`
// ahead — used for "next: Tuesday" style summaries without expanding an
// unbounded future.
export function nextOccurrenceDate(
  activity: Activity,
  today: string = todayISODate(),
  horizonDays = 60
): string | null {
  const occurrences = expandActivityOccurrences(activity, today, addDays(today, horizonDays))
  return occurrences[0]?.date ?? null
}

export function isMultiDayActivity(activity: Activity): boolean {
  return activity.recurrence_type === 'one_off' && !!activity.end_date && activity.end_date > activity.start_date
}

export function expandActivitiesOccurrences(
  activities: Activity[],
  rangeStart: string,
  rangeEnd: string
): ActivityOccurrence[] {
  return activities.flatMap((activity) => expandActivityOccurrences(activity, rangeStart, rangeEnd))
}

import { getCurrentLanguage } from '../i18n'
import { t } from '../strings'
import type { Chore } from './choreModel.ts'
import {
  compareISODates,
  daysBetweenISO,
  todayISODate,
  toUTCDate,
} from './isoDate.ts'

export { addDays, compareISODates, daysBetweenISO, todayISODate, toISODate, toUTCDate } from './isoDate.ts'

export type DueUrgency = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'upcoming'

export function classifyDueDate(dueDate: string, today: string = todayISODate()): DueUrgency {
  const diff = daysBetweenISO(today, dueDate)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 6) return 'thisWeek'
  return 'upcoming'
}

export function isDueTodayOrEarlier(dueDate: string, today: string = todayISODate()): boolean {
  return compareISODates(dueDate, today) <= 0
}

export function formatShortDate(iso: string): string {
  return toUTCDate(iso).toLocaleDateString(getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export function formatFullDate(iso: string): string {
  return toUTCDate(iso).toLocaleDateString(getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "24. 7. 2026" — all-numeric, for compact contextual copy rather than long-form dates. */
export function formatNumericDate(iso: string): string {
  return toUTCDate(iso).toLocaleDateString(getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatMonthYear(iso: string): string {
  return toUTCDate(iso).toLocaleDateString(getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDueDateLabel(dueDate: string, today: string = todayISODate()): string {
  const urgency = classifyDueDate(dueDate, today)
  if (urgency === 'overdue') return t.due.overdue
  if (urgency === 'today') return t.due.today
  if (urgency === 'tomorrow') return t.due.tomorrow
  if (urgency === 'thisWeek') return t.due.thisWeek
  return formatShortDate(dueDate)
}

export function compareChoresByDueDate(a: Chore, b: Chore): number {
  const aDue = a.due_date
  const bDue = b.due_date
  if (!aDue && bDue) return 1
  if (aDue && !bDue) return -1
  if (!aDue || !bDue) return a.title.localeCompare(b.title)
  const dateCompare = compareISODates(aDue, bDue)
  if (dateCompare !== 0) return dateCompare
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.title.localeCompare(b.title)
}

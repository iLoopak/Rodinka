import { t } from '../strings'
import { getCurrentLanguage } from '../i18n'
import type { Chore } from '../hooks/useChores'

export type DueUrgency = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'upcoming'

// "Today" from the viewer's local calendar day — due dates are entered and
// judged against the browser's local clock, not UTC.
export function todayISODate(): string {
  return toISODate(new Date())
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Zero-padded YYYY-MM-DD strings sort correctly as plain strings — no Date
// parsing (and therefore no timezone drift) needed to compare them.
export function compareISODates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Parsed as UTC so date arithmetic and formatting never shift the calendar
// day based on the viewer's local timezone offset (a date-only value has
// no "moment", so it must be anchored consistently rather than
// reinterpreted as local midnight).
export function toUTCDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(iso: string, days: number): string {
  const date = toUTCDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// Whole-day difference between two YYYY-MM-DD values (b - a). Positive
// when b is later than a.
export function daysBetweenISO(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((toUTCDate(b).getTime() - toUTCDate(a).getTime()) / msPerDay)
}

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

// Longer form used where the year matters (e.g. far-future/past dates in
// detail views) — still UTC-anchored for the same drift-safety reason.
export function formatFullDate(iso: string): string {
  return toUTCDate(iso).toLocaleDateString(getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// "Červenec 2026" / "July 2026" — used for the calendar's month header.
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

// Ascending due date first (so overdue, then today, then upcoming dates
// fall out in order automatically), then a stable tie-breaker.
export function compareChoresByDueDate(a: Chore, b: Chore): number {
  const dateCompare = compareISODates(a.due_date, b.due_date)
  if (dateCompare !== 0) return dateCompare
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.title.localeCompare(b.title)
}

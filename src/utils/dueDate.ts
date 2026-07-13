import { t, currentLang } from '../strings'
import type { Chore } from '../hooks/useChores'

export type DueUrgency = 'overdue' | 'today' | 'tomorrow' | 'upcoming'

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

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function classifyDueDate(dueDate: string, today: string = todayISODate()): DueUrgency {
  const cmp = compareISODates(dueDate, today)
  if (cmp < 0) return 'overdue'
  if (cmp === 0) return 'today'
  if (dueDate === addDays(today, 1)) return 'tomorrow'
  return 'upcoming'
}

export function isDueTodayOrEarlier(dueDate: string, today: string = todayISODate()): boolean {
  return compareISODates(dueDate, today) <= 0
}

// Parsed as UTC so the displayed day never shifts based on the viewer's
// local timezone offset (a date-only value has no "moment", so it must be
// anchored consistently rather than reinterpreted as local midnight).
function parseISODateUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatShortDate(iso: string): string {
  return parseISODateUTC(iso).toLocaleDateString(currentLang === 'cs' ? 'cs-CZ' : 'en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export function formatDueDateLabel(dueDate: string, today: string = todayISODate()): string {
  const urgency = classifyDueDate(dueDate, today)
  if (urgency === 'overdue') return t.chores.dueOverdue
  if (urgency === 'today') return t.chores.dueToday
  if (urgency === 'tomorrow') return t.chores.dueTomorrow
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

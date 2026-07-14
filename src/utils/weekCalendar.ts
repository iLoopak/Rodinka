import type { CalendarEntry } from './calendarEntries'
import { addDays, toUTCDate } from './dueDate'
import { getWeekDates, getWeekStart, shiftWeek } from './mealWeek'

export { getWeekDates, getWeekStart, shiftWeek }

export interface WeekDayGroup {
  date: string
  entries: CalendarEntry[]
  untimed: CalendarEntry[]
  timed: CalendarEntry[]
}

function stableEntryOrder(a: CalendarEntry, b: CalendarEntry) {
  if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1
  const timeA = a.time ?? ''
  const timeB = b.time ?? ''
  if (timeA !== timeB) return timeA < timeB ? -1 : 1
  if (a.title !== b.title) return a.title.localeCompare(b.title)
  return a.id.localeCompare(b.id)
}

export function groupEntriesForWeek(entries: CalendarEntry[], weekStart: string): WeekDayGroup[] {
  const dates = getWeekDates(getWeekStart(weekStart))
  const byDate = new Map(dates.map((date) => [date, [] as CalendarEntry[]]))
  for (const entry of entries) byDate.get(entry.date)?.push(entry)
  return dates.map((date) => {
    const dayEntries = (byDate.get(date) ?? []).sort(stableEntryOrder)
    return {
      date,
      entries: dayEntries,
      untimed: dayEntries.filter((entry) => !entry.time),
      timed: dayEntries.filter((entry) => Boolean(entry.time)),
    }
  })
}

export function memberIdsForCalendarEntries(entries: CalendarEntry[]): string[] {
  const ids = new Set<string>()
  for (const entry of entries) {
    for (const id of entry.participantMemberIds ?? []) ids.add(id)
    if (entry.childOrPatientId) ids.add(entry.childOrPatientId)
    if (entry.responsibleMemberId) ids.add(entry.responsibleMemberId)
  }
  return [...ids]
}

function localeCode(locale: 'cs' | 'en') {
  return locale === 'cs' ? 'cs-CZ' : 'en-US'
}

function monthName(iso: string, locale: 'cs' | 'en') {
  return toUTCDate(iso).toLocaleDateString(localeCode(locale), { month: 'long', timeZone: 'UTC' })
}

export function formatCalendarWeekLabel(weekStart: string, locale: 'cs' | 'en' = 'cs') {
  const start = getWeekStart(weekStart)
  const end = addDays(start, 6)
  const startDay = Number(start.slice(8, 10))
  const endDay = Number(end.slice(8, 10))
  const startYear = start.slice(0, 4)
  const endYear = end.slice(0, 4)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)

  if (locale === 'en') {
    if (sameMonth) return `${monthName(start, locale)} ${startDay}–${endDay}, ${endYear}`
    if (startYear === endYear) return `${monthName(start, locale)} ${startDay} – ${monthName(end, locale)} ${endDay}, ${endYear}`
    return `${monthName(start, locale)} ${startDay}, ${startYear} – ${monthName(end, locale)} ${endDay}, ${endYear}`
  }
  if (sameMonth) return `${startDay}.–${endDay}. ${monthName(end, locale)} ${endYear}`
  if (startYear === endYear) return `${startDay}. ${monthName(start, locale)} – ${endDay}. ${monthName(end, locale)} ${endYear}`
  return `${startDay}. ${monthName(start, locale)} ${startYear} – ${endDay}. ${monthName(end, locale)} ${endYear}`
}

export function formatWeekDayHeading(iso: string, locale: 'cs' | 'en' = 'cs') {
  return toUTCDate(iso).toLocaleDateString(localeCode(locale), {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}


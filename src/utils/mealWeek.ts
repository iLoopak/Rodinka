import { addDays, compareISODates, formatShortDate, todayISODate, toUTCDate } from './dueDate'

function isoWeekday(iso: string): number {
  const day = toUTCDate(iso).getUTCDay() // 0 (Sun) .. 6 (Sat)
  return day === 0 ? 7 : day // 1 (Mon) .. 7 (Sun)
}

// Monday of the week containing `dateISO` — Czech-first week start.
export function getWeekStart(dateISO: string): string {
  return addDays(dateISO, -(isoWeekday(dateISO) - 1))
}

export function getCurrentWeekStart(): string {
  return getWeekStart(todayISODate())
}

// All 7 dates in the week starting `weekStartISO`, Monday through Sunday.
export function getWeekDates(weekStartISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i))
}

export function shiftWeek(weekStartISO: string, deltaWeeks: number): string {
  return addDays(weekStartISO, deltaWeeks * 7)
}

export function isCurrentWeek(weekStartISO: string, today: string = todayISODate()): boolean {
  return weekStartISO === getWeekStart(today)
}

export function isToday(dateISO: string, today: string = todayISODate()): boolean {
  return compareISODates(dateISO, today) === 0
}

// "13. – 19. 7." / "Jul 13 – 19" style range label for the week header.
export function formatWeekRangeLabel(weekStartISO: string): string {
  const weekEnd = addDays(weekStartISO, 6)
  return `${formatShortDate(weekStartISO)} – ${formatShortDate(weekEnd)}`
}

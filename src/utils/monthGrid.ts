import { addDays, compareISODates, toUTCDate } from './dueDate'

function isoWeekday(iso: string): number {
  const day = toUTCDate(iso).getUTCDay() // 0 (Sun) .. 6 (Sat)
  return day === 0 ? 7 : day // 1 (Mon) .. 7 (Sun)
}

// The date range a month grid needs to render — the visible month plus
// the leading/trailing days from adjacent months that fill out full weeks
// (grid always starts on a Monday and ends on a Sunday).
export function getMonthGridRange(anchorISO: string): { start: string; end: string } {
  const [y, m] = anchorISO.split('-').map(Number)
  const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
  const start = addDays(firstOfMonth, -(isoWeekday(firstOfMonth) - 1))

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lastOfMonth = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  const end = addDays(lastOfMonth, 7 - isoWeekday(lastOfMonth))

  return { start, end }
}

export function buildMonthWeeks(anchorISO: string): string[][] {
  const { start, end } = getMonthGridRange(anchorISO)
  const weeks: string[][] = []
  let week: string[] = []
  let cursor = start
  while (compareISODates(cursor, end) <= 0) {
    week.push(cursor)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
    cursor = addDays(cursor, 1)
  }
  return weeks
}

export function shiftMonth(anchorISO: string, delta: number): string {
  const [y, m] = anchorISO.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

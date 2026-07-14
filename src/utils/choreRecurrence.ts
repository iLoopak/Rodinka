import { t } from '../strings'
import type { Chore, ChoreRecurrenceType } from './choreModel'
import { addDays, compareISODates, toUTCDate } from './dueDate'
import { isValidISODate } from './deepLinks'

interface NextChoreDueDateInput {
  recurrence: ChoreRecurrenceType
  currentDueDate: string
  completedOn: string
  selectedWeekdays?: number[] | null
  preferredDayOfMonth?: number | null
}

const MAX_RECURRENCE_STEPS = 4000

function isoWeekday(iso: string): number {
  const weekday = toUTCDate(iso).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function nextMonthlyDate(current: string, preferredDay: number): string {
  const currentDate = toUTCDate(current)
  const firstOfNextMonth = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 1))
  const year = firstOfNextMonth.getUTCFullYear()
  const month = firstOfNextMonth.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(preferredDay, lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Date-only in, date-only out. The calculation advances from the planned
// occurrence and skips obsolete dates until the result is at least the local
// approval day, so delayed approval never creates a new overdue occurrence.
export function getNextChoreDueDate({
  recurrence,
  currentDueDate,
  completedOn,
  selectedWeekdays,
  preferredDayOfMonth,
}: NextChoreDueDateInput): string | null {
  if (recurrence === 'none') return null
  if (!isValidISODate(currentDueDate) || !isValidISODate(completedOn)) return null

  const weekdays = new Set(
    (selectedWeekdays ?? []).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  )
  if (recurrence === 'daily' && weekdays.size === 0) return null

  const preferredDay = preferredDayOfMonth ?? Number(currentDueDate.slice(8, 10))
  if (recurrence === 'monthly' && (!Number.isInteger(preferredDay) || preferredDay < 1 || preferredDay > 31)) {
    return null
  }

  let candidate = currentDueDate
  for (let guard = 0; guard < MAX_RECURRENCE_STEPS; guard++) {
    if (recurrence === 'daily') {
      do {
        candidate = addDays(candidate, 1)
      } while (!weekdays.has(isoWeekday(candidate)))
    } else if (recurrence === 'weekly') {
      candidate = addDays(candidate, 7)
    } else {
      candidate = nextMonthlyDate(candidate, preferredDay)
    }

    if (
      compareISODates(candidate, currentDueDate) > 0 &&
      compareISODates(candidate, completedOn) >= 0
    ) {
      return candidate
    }
  }
  return null
}

function joinWeekdayNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} ${t.chores.weekdayJoin} ${names[1]}`
  return `${names.slice(0, -1).join(', ')} ${t.chores.weekdayJoin} ${names.at(-1)}`
}

export function choreRecurrenceSummary(chore: Pick<Chore,
  'recurrence_type' | 'recurrence_weekdays' | 'preferred_day_of_month' | 'due_date'
>): string {
  if (chore.recurrence_type === 'none') return t.chores.recurrenceSummaryNone
  if (chore.recurrence_type === 'weekly') {
    return t.chores.recurrenceSummaryWeeklyByDay[isoWeekday(chore.due_date) - 1]
  }
  if (chore.recurrence_type === 'monthly') {
    return t.chores.recurrenceSummaryMonthly(chore.preferred_day_of_month ?? Number(chore.due_date.slice(8, 10)))
  }

  const weekdays = [...new Set(chore.recurrence_weekdays ?? [])].sort((a, b) => a - b)
  if (weekdays.length === 7) return t.chores.recurrenceSummaryEveryDay
  if (weekdays.join(',') === '1,2,3,4,5') return t.chores.recurrenceSummaryWorkdays
  const names = weekdays.map((day) => t.chores.weekdayNames[day - 1]).filter(Boolean)
  return t.chores.recurrenceSummarySelected(joinWeekdayNames(names))
}

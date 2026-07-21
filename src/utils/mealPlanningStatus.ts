import type { MealPlanEntry, MealSlot } from '../features/meals/domain/mealTypes'
import { addDays, compareISODates } from './dueDate'
import { getWeekDates, getWeekStart } from './mealWeek'

export const CORE_MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export function missingCoreSlotsForDate(entries: MealPlanEntry[], date: string): MealSlot[] {
  const covered = new Set(entries.filter((entry) => entry.entry_date === date).map((entry) => entry.meal_slot))
  return CORE_MEAL_SLOTS.filter((slot) => !covered.has(slot))
}

export type MealPlanningHint =
  | { kind: 'tomorrow-empty' }
  | { kind: 'tomorrow-partial'; missingCount: number }
  | { kind: 'weekend-empty' }

// Priority mirrors what a parent actually needs to act on next: an
// unplanned tomorrow, then a partially planned one, then a fully unplanned
// upcoming weekend once it's still ahead of them.
export function mealPlanningHint(entries: MealPlanEntry[], today: string): MealPlanningHint | null {
  const tomorrow = addDays(today, 1)
  const missingTomorrow = missingCoreSlotsForDate(entries, tomorrow)
  if (missingTomorrow.length === CORE_MEAL_SLOTS.length) return { kind: 'tomorrow-empty' }
  if (missingTomorrow.length > 0) return { kind: 'tomorrow-partial', missingCount: missingTomorrow.length }

  const weekDates = getWeekDates(getWeekStart(today))
  const [saturday, sunday] = [weekDates[5], weekDates[6]]
  const weekendStillAhead = compareISODates(today, saturday) <= 0
  const weekendPlanned = entries.some((entry) => entry.entry_date === saturday || entry.entry_date === sunday)
  if (weekendStillAhead && !weekendPlanned) return { kind: 'weekend-empty' }

  return null
}

export function isTomorrowFullyPlanned(entries: MealPlanEntry[], today: string): boolean {
  return missingCoreSlotsForDate(entries, addDays(today, 1)).length === 0
}

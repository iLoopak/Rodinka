import type { MealPlanEntry, MealSlot } from '../features/meals/domain/mealTypes'
import { addDays, daysBetweenISO } from './dueDate'

export const MEAL_SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other']

export function sortEntriesForDay(entries: MealPlanEntry[]): MealPlanEntry[] {
  return [...entries].sort((a, b) => {
    const slotDiff = MEAL_SLOT_ORDER.indexOf(a.meal_slot) - MEAL_SLOT_ORDER.indexOf(b.meal_slot)
    if (slotDiff !== 0) return slotDiff
    return (a.title ?? '').localeCompare(b.title ?? '')
  })
}

// Buckets entries by date (only for the given `dates`) and sorts each
// day's entries by meal slot order. Dates with no entries still get an
// empty array, so callers can render every day of the week consistently.
export function groupEntriesByDate(entries: MealPlanEntry[], dates: string[]): Map<string, MealPlanEntry[]> {
  const map = new Map<string, MealPlanEntry[]>()
  for (const date of dates) map.set(date, [])

  for (const entry of entries) {
    const bucket = map.get(entry.entry_date)
    if (bucket) bucket.push(entry)
  }

  for (const date of dates) {
    map.set(date, sortEntriesForDay(map.get(date) ?? []))
  }
  return map
}

// `title` is always populated by the app at write time (either a snapshot
// of the linked meal's name, or the custom one-off text), so this is a
// defensive fallback rather than the normal path.
export function displayTitle(entry: Pick<MealPlanEntry, 'title'>, fallback: string): string {
  return entry.title && entry.title.trim() !== '' ? entry.title : fallback
}

export function isValidPlanEntryInput(input: { mealId: string | null; title: string }): boolean {
  return input.mealId !== null || input.title.trim() !== ''
}

export interface CopyableEntryInput {
  entry_date: string
  meal_slot: MealSlot
  meal_id: string | null
  title: string | null
  responsible_member_id: string | null
  notes: string | null
}

// Produces new-entry payloads for `toWeekStart`, preserving each source
// entry's day offset from `fromWeekStart` (so a Wednesday dinner stays a
// Wednesday dinner in the copied week). Callers are expected to insert
// these as new rows (origin: 'copied') — nothing here touches the
// database directly.
export function buildCopiedEntries(
  entries: MealPlanEntry[],
  fromWeekStart: string,
  toWeekStart: string
): CopyableEntryInput[] {
  return entries.map((entry) => {
    const offsetDays = daysBetweenISO(fromWeekStart, entry.entry_date)
    return {
      entry_date: addDays(toWeekStart, offsetDays),
      meal_slot: entry.meal_slot,
      meal_id: entry.meal_id,
      title: entry.title,
      responsible_member_id: entry.responsible_member_id,
      notes: entry.notes,
    }
  })
}

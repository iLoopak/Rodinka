import { describe, expect, it } from 'vitest'
import {
  buildCopiedEntries,
  displayTitle,
  groupEntriesByDate,
  isValidPlanEntryInput,
  sortEntriesForDay,
} from './mealPlanGrouping'
import { makeMealPlanEntry } from './testFixtures'

describe('sortEntriesForDay', () => {
  it('orders by meal slot (breakfast, lunch, dinner, snack, other)', () => {
    const entries = [
      makeMealPlanEntry({ id: 'a', meal_slot: 'dinner', title: 'Dinner' }),
      makeMealPlanEntry({ id: 'b', meal_slot: 'breakfast', title: 'Breakfast' }),
      makeMealPlanEntry({ id: 'c', meal_slot: 'lunch', title: 'Lunch' }),
    ]
    expect(sortEntriesForDay(entries).map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks ties within the same slot alphabetically by title', () => {
    const entries = [
      makeMealPlanEntry({ id: 'z', meal_slot: 'dinner', title: 'Zebra stew' }),
      makeMealPlanEntry({ id: 'a', meal_slot: 'dinner', title: 'Apple pie' }),
    ]
    expect(sortEntriesForDay(entries).map((e) => e.id)).toEqual(['a', 'z'])
  })
})

describe('groupEntriesByDate', () => {
  it('buckets entries by date and includes empty days', () => {
    const dates = ['2026-07-13', '2026-07-14', '2026-07-15']
    const entries = [
      makeMealPlanEntry({ id: 'a', entry_date: '2026-07-13', meal_slot: 'breakfast' }),
      makeMealPlanEntry({ id: 'b', entry_date: '2026-07-13', meal_slot: 'dinner' }),
      makeMealPlanEntry({ id: 'c', entry_date: '2026-07-15', meal_slot: 'lunch' }),
    ]
    const grouped = groupEntriesByDate(entries, dates)
    expect(grouped.get('2026-07-13')?.map((e) => e.id)).toEqual(['a', 'b'])
    expect(grouped.get('2026-07-14')).toEqual([])
    expect(grouped.get('2026-07-15')?.map((e) => e.id)).toEqual(['c'])
  })

  it('ignores entries outside the requested date range', () => {
    const grouped = groupEntriesByDate([makeMealPlanEntry({ entry_date: '2099-01-01' })], ['2026-07-13'])
    expect(grouped.get('2026-07-13')).toEqual([])
  })
})

describe('displayTitle', () => {
  it('prefers the stored title', () => {
    expect(displayTitle({ title: 'Spaghetti' }, 'Untitled')).toBe('Spaghetti')
  })

  it('falls back when title is null or blank', () => {
    expect(displayTitle({ title: null }, 'Untitled')).toBe('Untitled')
    expect(displayTitle({ title: '   ' }, 'Untitled')).toBe('Untitled')
  })
})

describe('isValidPlanEntryInput', () => {
  it('requires either a linked meal or a non-empty custom title', () => {
    expect(isValidPlanEntryInput({ mealId: 'meal-1', title: '' })).toBe(true)
    expect(isValidPlanEntryInput({ mealId: null, title: 'Leftovers' })).toBe(true)
    expect(isValidPlanEntryInput({ mealId: null, title: '   ' })).toBe(false)
    expect(isValidPlanEntryInput({ mealId: null, title: '' })).toBe(false)
  })
})

describe('buildCopiedEntries', () => {
  it('preserves each entry\'s weekday offset in the target week', () => {
    const entries = [
      makeMealPlanEntry({ entry_date: '2026-07-13', meal_slot: 'dinner', title: 'Monday dinner' }), // Monday
      makeMealPlanEntry({ entry_date: '2026-07-15', meal_slot: 'lunch', title: 'Wednesday lunch' }), // Wednesday
    ]
    const copied = buildCopiedEntries(entries, '2026-07-13', '2026-07-20')
    expect(copied).toEqual([
      expect.objectContaining({ entry_date: '2026-07-20', meal_slot: 'dinner', title: 'Monday dinner' }),
      expect.objectContaining({ entry_date: '2026-07-22', meal_slot: 'lunch', title: 'Wednesday lunch' }),
    ])
  })

  it('carries over the linked meal and responsible member', () => {
    const entries = [
      makeMealPlanEntry({
        entry_date: '2026-07-13',
        meal_id: 'meal-9',
        title: 'Pizza',
        responsible_member_id: 'member-2',
      }),
    ]
    const [copied] = buildCopiedEntries(entries, '2026-07-13', '2026-07-20')
    expect(copied.meal_id).toBe('meal-9')
    expect(copied.responsible_member_id).toBe('member-2')
  })
})

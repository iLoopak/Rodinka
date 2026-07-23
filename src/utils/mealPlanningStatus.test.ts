import { describe, expect, it } from 'vitest'
import { makeMealPlanEntry } from './testFixtures'
import { isTomorrowFullyPlanned, mealPlanningHint, missingCoreSlotsForDate } from './mealPlanningStatus'

const TODAY = '2026-07-13' // Monday
const TOMORROW = '2026-07-14' // Tuesday

describe('missingCoreSlotsForDate', () => {
  it('returns all core slots when nothing is planned for the date', () => {
    expect(missingCoreSlotsForDate([], TOMORROW)).toEqual(['breakfast', 'lunch', 'dinner'])
  })

  it('counts any status as covering a slot, including skipped', () => {
    const entries = [
      makeMealPlanEntry({ id: 'a', entry_date: TOMORROW, meal_slot: 'breakfast', status: 'skipped' }),
      makeMealPlanEntry({ id: 'b', entry_date: TOMORROW, meal_slot: 'lunch', status: 'confirmed' }),
    ]
    expect(missingCoreSlotsForDate(entries, TOMORROW)).toEqual(['dinner'])
  })

  it('ignores entries for other dates', () => {
    const entries = [makeMealPlanEntry({ entry_date: TODAY, meal_slot: 'dinner' })]
    expect(missingCoreSlotsForDate(entries, TOMORROW)).toEqual(['breakfast', 'lunch', 'dinner'])
  })
})

describe('mealPlanningHint', () => {
  it('flags a fully empty tomorrow', () => {
    expect(mealPlanningHint([], TODAY)).toEqual({ kind: 'tomorrow-empty' })
  })

  it('flags a partially planned tomorrow with the missing count', () => {
    const entries = [makeMealPlanEntry({ entry_date: TOMORROW, meal_slot: 'dinner' })]
    expect(mealPlanningHint(entries, TODAY)).toEqual({ kind: 'tomorrow-partial', missingCount: 2 })
  })

  it('flags an unplanned upcoming weekend once tomorrow is fully planned', () => {
    const entries = ['breakfast', 'lunch', 'dinner'].map((meal_slot, index) =>
      makeMealPlanEntry({ id: `tomorrow-${index}`, entry_date: TOMORROW, meal_slot: meal_slot as 'breakfast' | 'lunch' | 'dinner' })
    )
    expect(mealPlanningHint(entries, TODAY)).toEqual({ kind: 'weekend-empty' })
  })

  it('returns null once tomorrow and the weekend are both planned', () => {
    const entries = [
      ...['breakfast', 'lunch', 'dinner'].map((meal_slot, index) =>
        makeMealPlanEntry({ id: `tomorrow-${index}`, entry_date: TOMORROW, meal_slot: meal_slot as 'breakfast' | 'lunch' | 'dinner' })
      ),
      makeMealPlanEntry({ id: 'sat', entry_date: '2026-07-18', meal_slot: 'dinner' }),
    ]
    expect(mealPlanningHint(entries, TODAY)).toBeNull()
  })

  it('does not flag a weekend that has already passed', () => {
    const entries = ['breakfast', 'lunch', 'dinner'].map((meal_slot, index) =>
      makeMealPlanEntry({ id: `tomorrow-${index}`, entry_date: '2026-07-20', meal_slot: meal_slot as 'breakfast' | 'lunch' | 'dinner' })
    )
    // Sunday: this week's weekend (Sat 07-18 / Sun 07-19) is already behind us.
    expect(mealPlanningHint(entries, '2026-07-19')).toBeNull()
  })
})

describe('isTomorrowFullyPlanned', () => {
  it('is false when a core slot is missing', () => {
    expect(isTomorrowFullyPlanned([], TODAY)).toBe(false)
  })

  it('is true once all three core slots are covered', () => {
    const entries = ['breakfast', 'lunch', 'dinner'].map((meal_slot, index) =>
      makeMealPlanEntry({ id: `${index}`, entry_date: TOMORROW, meal_slot: meal_slot as 'breakfast' | 'lunch' | 'dinner' })
    )
    expect(isTomorrowFullyPlanned(entries, TODAY)).toBe(true)
  })
})

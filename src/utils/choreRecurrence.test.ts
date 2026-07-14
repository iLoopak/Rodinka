import { describe, expect, it } from 'vitest'
import { choreRecurrenceSummary, getNextChoreDueDate } from './choreRecurrence'

describe('getNextChoreDueDate', () => {
  it('returns no date for a one-off chore', () => {
    expect(getNextChoreDueDate({ recurrence: 'none', currentDueDate: '2026-07-14', completedOn: '2026-07-14' })).toBeNull()
  })

  it('advances a daily chore with every weekday selected', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-07-14', completedOn: '2026-07-14', selectedWeekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe('2026-07-15')
  })

  it('uses Monday to Friday for workday chores', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-07-16', completedOn: '2026-07-16', selectedWeekdays: [1, 2, 3, 4, 5] })).toBe('2026-07-17')
  })

  it('uses only Tuesday and Thursday', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-07-14', completedOn: '2026-07-14', selectedWeekdays: [2, 4] })).toBe('2026-07-16')
  })

  it('moves a workday chore from Friday to Monday', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-07-17', completedOn: '2026-07-17', selectedWeekdays: [1, 2, 3, 4, 5] })).toBe('2026-07-20')
  })

  it('advances weekly by seven days', () => {
    expect(getNextChoreDueDate({ recurrence: 'weekly', currentDueDate: '2026-07-15', completedOn: '2026-07-15' })).toBe('2026-07-22')
  })

  it('keeps the preferred monthly day', () => {
    expect(getNextChoreDueDate({ recurrence: 'monthly', currentDueDate: '2026-06-15', completedOn: '2026-06-15', preferredDayOfMonth: 15 })).toBe('2026-07-15')
  })

  it('clamps day 31 in February and restores it in March', () => {
    const february = getNextChoreDueDate({ recurrence: 'monthly', currentDueDate: '2027-01-31', completedOn: '2027-01-31', preferredDayOfMonth: 31 })
    expect(february).toBe('2027-02-28')
    expect(getNextChoreDueDate({ recurrence: 'monthly', currentDueDate: february!, completedOn: february!, preferredDayOfMonth: 31 })).toBe('2027-03-31')
  })

  it('crosses the end of the year', () => {
    expect(getNextChoreDueDate({ recurrence: 'weekly', currentDueDate: '2026-12-30', completedOn: '2026-12-30' })).toBe('2027-01-06')
  })

  it('skips obsolete occurrences after delayed approval', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-07-17', completedOn: '2026-07-20', selectedWeekdays: [1, 2, 3, 4, 5] })).toBe('2026-07-20')
  })

  it('never returns the same occurrence date', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-07-14', completedOn: '2026-07-13', selectedWeekdays: [2] })).toBe('2026-07-21')
  })

  it('keeps date-only values stable without UTC day shifts', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-03-29', completedOn: '2026-03-29', selectedWeekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe('2026-03-30')
  })

  it('rejects a daily recurrence without selected weekdays', () => {
    expect(getNextChoreDueDate({ recurrence: 'daily', currentDueDate: '2026-07-14', completedOn: '2026-07-14', selectedWeekdays: [] })).toBeNull()
  })
})

describe('choreRecurrenceSummary', () => {
  it('uses the correct Czech weekday form for weekly recurrence', () => {
    expect(choreRecurrenceSummary({
      recurrence_type: 'weekly',
      recurrence_weekdays: null,
      preferred_day_of_month: null,
      due_date: '2026-07-15',
    })).toBe('Každý týden ve středu')
  })
})

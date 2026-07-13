import { describe, expect, it } from 'vitest'
import {
  formatWeekRangeLabel,
  getWeekDates,
  getWeekStart,
  isCurrentWeek,
  isToday,
  shiftWeek,
} from './mealWeek'

describe('getWeekStart', () => {
  it('returns the same date when given a Monday', () => {
    // 2026-07-13 is a Monday (verified against system clock in this repo's session).
    expect(getWeekStart('2026-07-13')).toBe('2026-07-13')
  })

  it('rolls back to Monday for any other weekday', () => {
    expect(getWeekStart('2026-07-14')).toBe('2026-07-13') // Tuesday
    expect(getWeekStart('2026-07-19')).toBe('2026-07-13') // Sunday
  })

  it('handles a month boundary correctly', () => {
    // 2026-08-01 is a Saturday; the Monday of that week is 2026-07-27.
    expect(getWeekStart('2026-08-01')).toBe('2026-07-27')
  })
})

describe('getWeekDates', () => {
  it('returns all 7 days Monday through Sunday', () => {
    expect(getWeekDates('2026-07-13')).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ])
  })
})

describe('shiftWeek', () => {
  it('moves forward and backward by whole weeks', () => {
    expect(shiftWeek('2026-07-13', 1)).toBe('2026-07-20')
    expect(shiftWeek('2026-07-13', -1)).toBe('2026-07-06')
    expect(shiftWeek('2026-07-13', 0)).toBe('2026-07-13')
  })
})

describe('isCurrentWeek', () => {
  it('is true only for the week containing today', () => {
    const today = '2026-07-15' // Wednesday
    expect(isCurrentWeek('2026-07-13', today)).toBe(true)
    expect(isCurrentWeek('2026-07-06', today)).toBe(false)
    expect(isCurrentWeek('2026-07-20', today)).toBe(false)
  })
})

describe('isToday', () => {
  it('compares date-only strings without any timezone conversion', () => {
    expect(isToday('2026-07-13', '2026-07-13')).toBe(true)
    expect(isToday('2026-07-14', '2026-07-13')).toBe(false)
  })
})

describe('formatWeekRangeLabel', () => {
  it('formats a compact start–end range', () => {
    const label = formatWeekRangeLabel('2026-07-13')
    expect(label).toContain('–')
    expect(label.length).toBeGreaterThan(0)
  })
})

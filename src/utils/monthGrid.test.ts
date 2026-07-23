import { describe, expect, it } from 'vitest'
import { addDays, compareISODates } from './dueDate'
import { buildMonthWeeks, getMonthGridRange, shiftMonth } from './monthGrid'

function isoWeekday(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

describe('getMonthGridRange', () => {
  it('starts on the Monday of the week containing the first of the month', () => {
    // 2026-07-01 is a Wednesday, so the grid reaches back to Monday 2026-06-29.
    expect(getMonthGridRange('2026-07').start).toBe('2026-06-29')
    // 2026-02-01 is a Sunday, so the grid reaches back a full week to 2026-01-26.
    expect(getMonthGridRange('2026-02').start).toBe('2026-01-26')
  })

  it('always begins on a Monday and ends on a Sunday', () => {
    for (const anchor of ['2026-01', '2026-02', '2024-02', '2026-07', '2026-11', '2026-12']) {
      const { start, end } = getMonthGridRange(anchor)
      expect(isoWeekday(start)).toBe(1)
      expect(isoWeekday(end)).toBe(7)
      expect(compareISODates(start, end)).toBeLessThan(0)
    }
  })

  it('covers the entire anchor month', () => {
    const { start, end } = getMonthGridRange('2026-07')
    expect(compareISODates(start, '2026-07-01')).toBeLessThanOrEqual(0)
    expect(compareISODates(end, '2026-07-31')).toBeGreaterThanOrEqual(0)
  })

  it('spans a whole number of weeks', () => {
    const { start, end } = getMonthGridRange('2026-07')
    let count = 1
    let cursor = start
    while (compareISODates(cursor, end) < 0) {
      cursor = addDays(cursor, 1)
      count += 1
    }
    expect(count % 7).toBe(0)
  })
})

describe('buildMonthWeeks', () => {
  it('produces rows of exactly seven consecutive days', () => {
    const weeks = buildMonthWeeks('2026-07')
    expect(weeks.length).toBeGreaterThanOrEqual(4)
    expect(weeks.length).toBeLessThanOrEqual(6)
    for (const week of weeks) {
      expect(week).toHaveLength(7)
      for (let i = 1; i < week.length; i += 1) {
        expect(week[i]).toBe(addDays(week[i - 1], 1))
      }
    }
  })

  it('matches the computed grid range at both ends', () => {
    const { start, end } = getMonthGridRange('2026-02')
    const weeks = buildMonthWeeks('2026-02')
    expect(weeks[0][0]).toBe(start)
    expect(weeks.at(-1)?.at(-1)).toBe(end)
  })

  it('contains the first and last day of the anchor month', () => {
    const flat = buildMonthWeeks('2026-07').flat()
    expect(flat).toContain('2026-07-01')
    expect(flat).toContain('2026-07-31')
  })
})

describe('shiftMonth', () => {
  it('returns the first of the month for the requested offset', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08-01')
    expect(shiftMonth('2026-07', -1)).toBe('2026-06-01')
    expect(shiftMonth('2026-07', 0)).toBe('2026-07-01')
  })

  it('rolls across year boundaries in both directions', () => {
    expect(shiftMonth('2026-07', 6)).toBe('2027-01-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01-01')
  })

  it('normalizes an anchor that already carries a day component', () => {
    expect(shiftMonth('2026-07-15', 1)).toBe('2026-08-01')
  })
})

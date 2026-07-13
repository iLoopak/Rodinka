import { describe, expect, it } from 'vitest'
import {
  addDays,
  classifyDueDate,
  compareChoresByDueDate,
  compareISODates,
  daysBetweenISO,
  formatDueDateLabel,
  isDueTodayOrEarlier,
} from './dueDate'
import { makeChore } from './testFixtures'

const TODAY = '2026-07-13'

describe('compareISODates', () => {
  it('orders dates lexicographically (safe for zero-padded ISO strings)', () => {
    expect(compareISODates('2026-07-13', '2026-07-13')).toBe(0)
    expect(compareISODates('2026-07-12', '2026-07-13')).toBeLessThan(0)
    expect(compareISODates('2026-07-14', '2026-07-13')).toBeGreaterThan(0)
  })
})

describe('daysBetweenISO', () => {
  it('counts whole days, including across a month boundary', () => {
    expect(daysBetweenISO('2026-07-13', '2026-07-13')).toBe(0)
    expect(daysBetweenISO('2026-07-13', '2026-07-14')).toBe(1)
    expect(daysBetweenISO('2026-07-30', '2026-08-02')).toBe(3)
  })
})

describe('addDays', () => {
  it('rolls over month and year boundaries correctly (UTC-anchored, no drift)', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('classifyDueDate', () => {
  it('classifies overdue, today, tomorrow, this week, and upcoming', () => {
    expect(classifyDueDate('2026-07-10', TODAY)).toBe('overdue')
    expect(classifyDueDate(TODAY, TODAY)).toBe('today')
    expect(classifyDueDate('2026-07-14', TODAY)).toBe('tomorrow')
    expect(classifyDueDate('2026-07-18', TODAY)).toBe('thisWeek') // +5 days
    expect(classifyDueDate('2026-07-19', TODAY)).toBe('thisWeek') // +6 days, still this-week boundary
    expect(classifyDueDate('2026-07-20', TODAY)).toBe('upcoming') // +7 days
  })

  it('handles a year-boundary date without drifting a day', () => {
    expect(classifyDueDate('2027-01-01', '2026-12-31')).toBe('tomorrow')
  })
})

describe('isDueTodayOrEarlier', () => {
  it('is true for today and the past, false for the future', () => {
    expect(isDueTodayOrEarlier('2026-07-10', TODAY)).toBe(true)
    expect(isDueTodayOrEarlier(TODAY, TODAY)).toBe(true)
    expect(isDueTodayOrEarlier('2026-07-14', TODAY)).toBe(false)
  })
})

describe('formatDueDateLabel', () => {
  it('returns the localized due-state word for near dates', () => {
    expect(formatDueDateLabel('2026-07-10', TODAY)).toBe('Po termínu')
    expect(formatDueDateLabel(TODAY, TODAY)).toBe('Dnes')
    expect(formatDueDateLabel('2026-07-14', TODAY)).toBe('Zítra')
    expect(formatDueDateLabel('2026-07-16', TODAY)).toBe('Tento týden')
  })

  it('falls back to a formatted short date for far-future dates', () => {
    const label = formatDueDateLabel('2026-09-01', TODAY)
    expect(label).not.toBe('')
    expect(['Po termínu', 'Dnes', 'Zítra', 'Tento týden']).not.toContain(label)
  })
})

describe('compareChoresByDueDate', () => {
  it('sorts by due date ascending, then created_at, then title', () => {
    const chores = [
      makeChore({ id: 'c1', due_date: '2026-07-14', created_at: '2026-07-01T10:00:00Z', title: 'B' }),
      makeChore({ id: 'c2', due_date: '2026-07-10', created_at: '2026-07-02T10:00:00Z', title: 'A' }),
      makeChore({ id: 'c3', due_date: TODAY, created_at: '2026-07-03T10:00:00Z', title: 'C' }),
      makeChore({ id: 'c4', due_date: '2026-07-10', created_at: '2026-07-01T10:00:00Z', title: 'Z' }),
    ]

    const sorted = [...chores].sort(compareChoresByDueDate).map((c) => c.id)
    // c4 and c2 share the earliest due_date; c4 was created first so it
    // comes first. Then today (c3), then the future one (c1).
    expect(sorted).toEqual(['c4', 'c2', 'c3', 'c1'])
  })
})

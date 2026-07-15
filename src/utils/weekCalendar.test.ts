import { describe, expect, it } from 'vitest'
import type { CalendarEntry } from './calendarEntries'
import {
  formatCalendarWeekLabel,
  getWeekDates,
  getWeekStart,
  groupEntriesForWeek,
  memberIdsForCalendarEntries,
  shiftWeek,
} from './weekCalendar'

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'chore:one',
    type: 'chore',
    date: '2026-07-13',
    time: null,
    title: 'Task',
    subtitle: null,
    childOrPatientId: null,
    responsibleMemberId: null,
    recurring: false,
    sourceType: 'chore',
    sourceId: 'one',
    ...overrides,
  }
}

describe('weekly calendar date navigation', () => {
  it('normalizes to Monday and always returns Monday through Sunday', () => {
    expect(getWeekStart('2026-07-19')).toBe('2026-07-13')
    expect(getWeekDates(getWeekStart('2026-07-19'))).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
      '2026-07-17', '2026-07-18', '2026-07-19',
    ])
  })

  it('moves across month and year boundaries without timezone drift', () => {
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04')
    expect(shiftWeek('2027-01-04', -1)).toBe('2026-12-28')
  })

  it('formats ranges that cross both a month and a year', () => {
    expect(formatCalendarWeekLabel('2026-07-27', 'cs')).toMatch(/červenec.*srpen.*2026/i)
    expect(formatCalendarWeekLabel('2026-12-28', 'en')).toMatch(/December.*2026.*January.*2027/i)
  })
})

describe('groupEntriesForWeek', () => {
  it('keeps all seven days, including empty days, and excludes outside entries', () => {
    const groups = groupEntriesForWeek([
      entry({ date: '2026-07-15' }),
      entry({ id: 'outside', date: '2026-07-20' }),
    ], '2026-07-13')

    expect(groups).toHaveLength(7)
    expect(groups.map((day) => day.date)).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
      '2026-07-17', '2026-07-18', '2026-07-19',
    ])
    expect(groups[2].entries).toHaveLength(1)
    expect(groups.filter((day) => day.entries.length === 0)).toHaveLength(6)
  })

  it('separates untimed and timed rows and sorts completed rows last', () => {
    const groups = groupEntriesForWeek([
      entry({ id: 'timed-late', sourceId: 'timed-late', time: '18:00', title: 'Later' }),
      entry({ id: 'untimed-done', sourceId: 'untimed-done', title: 'Done', completed: true }),
      entry({ id: 'timed-early', sourceId: 'timed-early', time: '08:00', title: 'Earlier' }),
      entry({ id: 'untimed-open', sourceId: 'untimed-open', title: 'Open' }),
    ], '2026-07-13')

    expect(groups[0].untimed.map((item) => item.id)).toEqual(['untimed-open', 'untimed-done'])
    expect(groups[0].timed.map((item) => item.id)).toEqual(['timed-early', 'timed-late'])
  })

  it('collects participant, subject, and responsible member indicators once', () => {
    expect(memberIdsForCalendarEntries([
      entry({ participantMemberIds: ['child'], childOrPatientId: 'child', responsibleMemberId: 'parent' }),
      entry({ id: 'two', sourceId: 'two', participantMemberIds: ['parent', 'sibling'] }),
    ])).toEqual(['child', 'parent', 'sibling'])
  })
})

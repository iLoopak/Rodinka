import { describe, expect, it } from 'vitest'
import { expandActivityOccurrences, nextOccurrenceDate } from './recurrence'
import { makeActivity } from './testFixtures'

describe('expandActivityOccurrences', () => {
  it('one_off: a single occurrence, only if start_date falls in range', () => {
    const activity = makeActivity({ recurrence_type: 'one_off', start_date: '2026-07-15' })

    expect(expandActivityOccurrences(activity, '2026-07-01', '2026-07-31')).toEqual([
      { id: `${activity.id}:2026-07-15`, activityId: activity.id, date: '2026-07-15' },
    ])
    expect(expandActivityOccurrences(activity, '2026-08-01', '2026-08-31')).toEqual([])
  })

  it('weekly: recurs every 7 days anchored to start_date, fast-forwarded into a later range', () => {
    const activity = makeActivity({ recurrence_type: 'weekly', start_date: '2026-07-01' }) // Wednesday

    const dates = expandActivityOccurrences(activity, '2026-07-01', '2026-07-31').map((o) => o.date)
    expect(dates).toEqual(['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29'])

    // Range that starts well after the series start: cadence must still
    // land on the same weekday, not drift.
    const laterDates = expandActivityOccurrences(activity, '2026-09-01', '2026-09-30').map((o) => o.date)
    for (const date of laterDates) {
      expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(3) // Wednesday
    }
    expect(laterDates.length).toBeGreaterThan(0)
  })

  it('biweekly: recurs every 14 days', () => {
    const activity = makeActivity({ recurrence_type: 'biweekly', start_date: '2026-07-01' })
    const dates = expandActivityOccurrences(activity, '2026-07-01', '2026-08-15').map((o) => o.date)
    expect(dates).toEqual(['2026-07-01', '2026-07-15', '2026-07-29', '2026-08-12'])
  })

  it('custom_weekdays: only fires on the selected ISO weekdays', () => {
    // Monday (1) and Thursday (4)
    const activity = makeActivity({
      recurrence_type: 'custom_weekdays',
      recurrence_weekdays: [1, 4],
      start_date: '2026-07-01',
    })
    const dates = expandActivityOccurrences(activity, '2026-07-01', '2026-07-14').map((o) => o.date)
    // 2026-07-01 is a Wednesday; Mondays/Thursdays in that window:
    expect(dates).toEqual(['2026-07-02', '2026-07-06', '2026-07-09', '2026-07-13'])
  })

  it('produces no occurrences for paused or finished activities', () => {
    const paused = makeActivity({ recurrence_type: 'weekly', status: 'paused', start_date: '2026-07-01' })
    const finished = makeActivity({ recurrence_type: 'weekly', status: 'finished', start_date: '2026-07-01' })
    expect(expandActivityOccurrences(paused, '2026-07-01', '2026-07-31')).toEqual([])
    expect(expandActivityOccurrences(finished, '2026-07-01', '2026-07-31')).toEqual([])
  })

  it('stops generating occurrences after end_date', () => {
    const activity = makeActivity({ recurrence_type: 'weekly', start_date: '2026-07-01', end_date: '2026-07-10' })
    const dates = expandActivityOccurrences(activity, '2026-07-01', '2026-07-31').map((o) => o.date)
    expect(dates).toEqual(['2026-07-01', '2026-07-08'])
  })

  it('produces stable, unique ids per activity + date', () => {
    const activity = makeActivity({ id: 'act-x', recurrence_type: 'weekly', start_date: '2026-07-01' })
    const first = expandActivityOccurrences(activity, '2026-07-01', '2026-07-31')
    const second = expandActivityOccurrences(activity, '2026-07-01', '2026-07-31')
    expect(first.map((o) => o.id)).toEqual(second.map((o) => o.id))
    expect(new Set(first.map((o) => o.id)).size).toBe(first.length)
  })
})

describe('nextOccurrenceDate', () => {
  it('returns the earliest occurrence on or after today', () => {
    const activity = makeActivity({ recurrence_type: 'weekly', start_date: '2026-07-01' })
    expect(nextOccurrenceDate(activity, '2026-07-10')).toBe('2026-07-15')
  })

  it('returns null when nothing falls within the horizon', () => {
    const activity = makeActivity({ recurrence_type: 'one_off', start_date: '2026-01-01' })
    expect(nextOccurrenceDate(activity, '2026-07-13', 30)).toBeNull()
  })
})

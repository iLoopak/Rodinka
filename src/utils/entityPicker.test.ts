import { describe, expect, it } from 'vitest'
import { formatEntityPickerDate } from './entityPicker'

describe('formatEntityPickerDate', () => {
  it('formats a plain calendar date', () => {
    expect(formatEntityPickerDate('2026-07-14', 'cs')).toBe('14. 7.')
    expect(formatEntityPickerDate('2026-07-14', 'en')).toBe('7/14')
  })

  it('does not shift the day for timezones behind UTC', () => {
    // `new Date('2026-07-14')` is parsed as UTC midnight, which renders as
    // the 13th anywhere west of Greenwich. Chore/activity dates are calendar
    // dates, so they must be built from local components instead.
    const parsedAsUtc = new Date('2026-01-01')
    expect(parsedAsUtc.getUTCDate()).toBe(1)
    expect(formatEntityPickerDate('2026-01-01', 'cs')).toBe('1. 1.')
  })

  it('tolerates a full timestamp by reading only the date part', () => {
    expect(formatEntityPickerDate('2026-07-14T18:30:00Z', 'cs')).toBe('14. 7.')
  })

  it('returns an empty string for anything unparseable', () => {
    expect(formatEntityPickerDate('', 'cs')).toBe('')
    expect(formatEntityPickerDate('not-a-date', 'cs')).toBe('')
  })
})

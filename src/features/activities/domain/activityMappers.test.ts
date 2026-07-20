import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_COLUMNS,
  ACTIVITY_PARTICIPANT_HISTORY_COLUMNS,
  OCCURRENCE_OVERRIDE_COLUMNS,
  SERIES_ASSIGNMENT_HISTORY_COLUMNS,
  mapActivity,
  mapActivityParticipantHistory,
  mapOccurrenceOverride,
  mapSeriesAssignmentHistory,
} from './activityMappers'

describe('activity mappers', () => {
  it('flattens the participants join into participant_ids', () => {
    const activity = mapActivity({
      id: 'a1', title: 'Plavání',
      activity_participants: [{ member_id: 'm1' }, { member_id: 'm2' }],
    })
    expect(activity.participant_ids).toEqual(['m1', 'm2'])
  })

  it('prefers explicitly supplied participants over the joined ones', () => {
    // A realtime row carries no join, so the caller passes the participants it
    // already holds; blanking them on every update was the old failure mode.
    const activity = mapActivity({ id: 'a1', activity_participants: [{ member_id: 'm1' }] }, ['m9'])
    expect(activity.participant_ids).toEqual(['m9'])
  })

  it('treats a row with no participants join as having none', () => {
    expect(mapActivity({ id: 'a1' }).participant_ids).toEqual([])
  })

  it('parses a payment amount that arrives as a string', () => {
    expect(mapActivity({ id: 'a1', payment_amount: '450.50' }).payment_amount).toBe(450.5)
    expect(mapActivity({ id: 'a1', payment_amount: null }).payment_amount).toBeNull()
  })

  it('keeps only valid ISO weekday numbers', () => {
    expect(mapActivity({ id: 'a1', recurrence_weekdays: [1, 3, 5] }).recurrence_weekdays).toEqual([1, 3, 5])
    // 0 and 8 are not ISO weekdays; a bad value must not reach recurrence
    // expansion, where it would silently project occurrences on no day at all.
    expect(mapActivity({ id: 'a1', recurrence_weekdays: [0, 3, 8] }).recurrence_weekdays).toEqual([3])
    expect(mapActivity({ id: 'a1', recurrence_weekdays: [] }).recurrence_weekdays).toBeNull()
    expect(mapActivity({ id: 'a1', recurrence_weekdays: null }).recurrence_weekdays).toBeNull()
  })

  it('defaults a missing recurrence type to one_off rather than guessing', () => {
    expect(mapActivity({ id: 'a1' }).recurrence_type).toBe('one_off')
    expect(mapActivity({ id: 'a1' }).status).toBe('active')
    expect(mapActivity({ id: 'a1' }).all_day).toBe(false)
  })

  it('maps an occurrence override, keeping the two member roles apart', () => {
    const override = mapOccurrenceOverride({
      id: 'o1', family_id: 'f1', series_type: 'activity', series_id: 'a1',
      occurrence_date: '2026-07-21', companion_member_id: 'm1', assignee_member_id: null, cancelled: false,
    })
    // companion is the activity escort; assignee is the chore owner. Collapsing
    // them would silently move one domain's data into the other.
    expect(override.companion_member_id).toBe('m1')
    expect(override.assignee_member_id).toBeNull()
    expect(override.cancelled).toBe(false)
  })

  it('maps history rows including an open-ended participant period', () => {
    expect(mapSeriesAssignmentHistory({ id: 'h1', series_type: 'task', member_id: null }).member_id).toBeNull()
    const participant = mapActivityParticipantHistory({ id: 'p1', activity_id: 'a1', member_id: 'm1', effective_from: '2026-01-01', effective_to: null })
    // A null effective_to means "still current", not "missing data".
    expect(participant.effective_to).toBeNull()
  })

  it('is the single definition of every column list it owns', () => {
    // These four lists were previously duplicated in calendarSync. The
    // regression this guards is a column added to one copy and not the other,
    // which makes the calendar and the activities screen disagree (P1-M1).
    expect(ACTIVITY_COLUMNS).toContain('activity_participants(member_id)')
    expect(ACTIVITY_COLUMNS).toContain('recurrence_weekdays')
    expect(OCCURRENCE_OVERRIDE_COLUMNS).toContain('companion_member_id')
    expect(SERIES_ASSIGNMENT_HISTORY_COLUMNS).toContain('effective_from')
    expect(ACTIVITY_PARTICIPANT_HISTORY_COLUMNS).toContain('effective_to')
  })
})

describe('calendar snapshot shares the activity column lists', () => {
  it('does not spell the columns out a second time', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sync = readFileSync(join(process.cwd(), 'src/calendar/calendarSync.ts'), 'utf8')

    expect(sync).toContain('ACTIVITY_COLUMNS')
    expect(sync).toContain('OCCURRENCE_OVERRIDE_COLUMNS')
    expect(sync).toContain('MEAL_PLAN_ENTRY_COLUMNS')
    // The literal that used to live here.
    expect(sync).not.toContain("'id, family_id, series_type, series_id, occurrence_date")
  })
})

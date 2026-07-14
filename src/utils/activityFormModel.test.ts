import { describe, expect, it } from 'vitest'
import { makeActivity } from './testFixtures'
import {
  activityHasAdvancedDetails,
  activityHasContact,
  activityHasPayment,
  defaultActivityCategory,
  selectedRecurrenceWeekdays,
  selectWholeFamily,
  toggleMemberSelection,
  toggleRecurrenceWeekday,
} from './activityFormModel'

describe('activity form disclosure', () => {
  it('keeps a plain activity collapsed and expands saved advanced values', () => {
    expect(activityHasAdvancedDetails(makeActivity({ category: 'other', recurrence_type: 'weekly' }))).toBe(false)
    expect(activityHasAdvancedDetails(makeActivity({ skill_level: 'Pokročilý' }))).toBe(true)
    expect(activityHasAdvancedDetails(makeActivity({ coach_email: 'coach@example.com' }))).toBe(true)
    expect(activityHasAdvancedDetails(makeActivity({ payment_amount: 500 }))).toBe(true)
    expect(activityHasAdvancedDetails(makeActivity({ reminder_enabled: true }))).toBe(true)
  })

  it('uses type-specific neutral categories without deleting saved values', () => {
    expect(defaultActivityCategory('club')).toBe('other')
    expect(defaultActivityCategory('event')).toBe('other_event')
  })

  it('detects optional groups only when they contain saved data', () => {
    expect(activityHasContact(makeActivity())).toBe(false)
    expect(activityHasContact(makeActivity({ coach_phone: '+420 123 456 789' }))).toBe(true)
    expect(activityHasPayment(makeActivity())).toBe(false)
    expect(activityHasPayment(makeActivity({ next_payment_due_date: '2026-08-01' }))).toBe(true)
  })
})

describe('activity participant and recurrence selection', () => {
  it('supports participant multi-select and whole-family selection', () => {
    expect(toggleMemberSelection(['child'], 'parent')).toEqual(['child', 'parent'])
    expect(toggleMemberSelection(['child', 'parent'], 'child')).toEqual(['parent'])
    expect(selectWholeFamily(['parent', 'child', 'parent'])).toEqual(['parent', 'child'])
  })

  it('anchors simple recurrence to the start date and supports custom weekday chips', () => {
    expect(selectedRecurrenceWeekdays('weekly', '2026-07-14', [])).toEqual([2])
    expect(selectedRecurrenceWeekdays('biweekly', '2026-07-15', [])).toEqual([3])
    expect(selectedRecurrenceWeekdays('custom_weekdays', '2026-07-14', [4, 2])).toEqual([2, 4])
    expect(toggleRecurrenceWeekday([2], 4)).toEqual([2, 4])
    expect(toggleRecurrenceWeekday([2, 4], 2)).toEqual([4])
  })
})

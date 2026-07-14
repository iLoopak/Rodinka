import { describe, expect, it } from 'vitest'
import { choreInputToRow, normalizeChore } from './choreModel'

const legacy = {
  id: 'chore-1', family_id: 'family-1', title: 'Tidy room', description: null,
  assigned_to: 'child-1', due_date: '2026-07-15', reward_amount: 10,
  recurring: false, created_at: '2026-07-01T10:00:00Z',
}

describe('chore model compatibility', () => {
  it('loads an old one-off record without recurrence fields', () => {
    expect(normalizeChore(legacy)).toMatchObject({ recurrence_type: 'none', recurring: false, status: 'active' })
  })

  it('maps the legacy recurring boolean to weekly', () => {
    expect(normalizeChore({ ...legacy, recurring: true })).toMatchObject({ recurrence_type: 'weekly', recurring: true })
  })

  it('normalizes missing daily weekdays to every day', () => {
    expect(normalizeChore({ ...legacy, recurrence_type: 'daily' }).recurrence_weekdays).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('maps structured create/edit input without duplicating a chore', () => {
    expect(choreInputToRow({
      title: '  Tidy room ', description: '  Before dinner ', assignedTo: 'child-1',
      dueDate: '2026-07-16', rewardAmount: 12, recurrenceType: 'daily',
      recurrenceWeekdays: [2, 4], preferredDayOfMonth: null,
    })).toEqual({
      title: 'Tidy room', description: 'Before dinner', assigned_to: 'child-1',
      due_date: '2026-07-16', reward_amount: 12, recurring: true,
      recurrence_type: 'daily', recurrence_weekdays: [2, 4], preferred_day_of_month: null,
      reward_enabled: true, reward_currency: 'CZK', requires_approval: true,
      category: null, priority: 'normal',
    })
  })

  it('creates a normal unassigned task without reward or approval', () => {
    expect(choreInputToRow({
      title: 'Fix shelf', description: '', assignedTo: null, dueDate: null, rewardAmount: 50,
      rewardEnabled: false, requiresApproval: false, recurrenceType: 'weekly', recurrenceWeekdays: null,
      preferredDayOfMonth: null,
    })).toMatchObject({
      assigned_to: null, due_date: null, reward_amount: 0, reward_enabled: false,
      requires_approval: false, recurrence_type: 'none', recurring: false,
    })
  })

  it('preserves a migrated rewarded child chore and approval workflow', () => {
    expect(normalizeChore(legacy)).toMatchObject({ reward_enabled: true, requires_approval: true, reward_currency: 'CZK' })
  })
})

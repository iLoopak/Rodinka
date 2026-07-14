import { describe, expect, it } from 'vitest'
import { makeChore, makeFamilyMember } from '../utils/testFixtures'
import { defaultNotificationPreferences, generateReminderDrafts, type ReminderCopy } from './reminders'

const copy: ReminderCopy = {
  choreDueToday: (count) => `${count} due`, choreOverdue: (count) => `${count} overdue`, activitySoon: (title) => title,
  activityPayment: (count) => `${count} payments`, medicalTomorrow: 'Medical', vaccinationDue: 'Vaccination',
  votingCloses: (title) => title, mealEmpty: 'Empty', mealIncomplete: (count) => `${count} missing`,
  allowancePending: (count) => `${count} approvals`, documentExpiry: (count) => `${count} documents`,
  shoppingAssigned: (count) => `${count} shopping`, openDetail: 'Open', forMember: (name) => name,
}

describe('reminder generator performance', () => {
  it('evaluates a large realistic chore set once without multiplying reminders', () => {
    const parent = makeFamilyMember({ id: 'parent', role: 'parent', user_id: 'user' })
    const child = makeFamilyMember({ id: 'child', role: 'child' })
    const chores = Array.from({ length: 1_000 }, (_, index) => makeChore({ id: `chore-${index}`, assigned_to: child.id, due_date: index % 2 ? '2026-07-14' : '2026-07-13' }))
    const started = performance.now()
    const reminders = generateReminderDrafts({
      familyId: 'family-1', currentMember: parent, isParentOrAdmin: true, members: [parent, child], chores,
      latestCompletionFor: () => null, activities: [], medicalRecords: [], voteRounds: [], planEntries: [],
      pendingCompletions: [], shoppingItems: [], preferences: defaultNotificationPreferences(parent.id, 'family-1', 'UTC'),
      copy, now: new Date('2026-07-14T10:00:00Z'),
    })
    expect(reminders.filter((item) => item.source === 'chore')).toHaveLength(2)
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})

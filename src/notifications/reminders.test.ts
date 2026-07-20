import { describe, expect, it } from 'vitest'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { MealVoteRound } from '../features/meals/domain/mealTypes'
import type { ShoppingItem } from '../utils/shopping'
import { makeActivity, makeChore, makeFamilyMember, makeMealPlanEntry, makeMealVote, makeMealVoteCandidate, makeMedicalRecord } from '../utils/testFixtures'
import {
  applyReminderPreferences,
  defaultNotificationPreferences,
  generateReminderDrafts,
  isValidTimeZone,
  reminderStatus,
  todayInTimeZone,
  type GenerateReminderInput,
  type ReminderCopy,
  type ReminderDocument,
} from './reminders'

const NOW = new Date('2026-07-14T10:00:00.000Z')
const parent = makeFamilyMember({ id: 'parent', display_name: 'Pat', role: 'parent', user_id: 'user-parent' })
const child = makeFamilyMember({ id: 'child-1', display_name: 'Viktor', role: 'child' })
const otherParent = makeFamilyMember({ id: 'parent-2', display_name: 'Robin', role: 'parent', user_id: 'user-parent-2' })
const copy: ReminderCopy = {
  choreDueToday: (count, name) => `${count} due for ${name}`,
  choreOverdue: (count, name) => `${count} overdue for ${name}`,
  activitySoon: (title) => `${title} soon`,
  activityPayment: (count) => `${count} payments`,
  medicalTomorrow: 'Medical appointment tomorrow',
  vaccinationDue: 'Vaccination due',
  votingCloses: (title) => `${title} closes`,
  mealEmpty: 'Tomorrow is empty',
  mealIncomplete: (count) => `${count} meals missing`,
  allowancePending: (count) => `${count} approvals`,
  documentExpiry: (count) => `${count} documents expire`,
  shoppingAssigned: (count) => `${count} shopping items`,
  openDetail: 'Open detail',
  forMember: (name) => `For ${name}`,
}

function baseInput(overrides: Partial<GenerateReminderInput> = {}): GenerateReminderInput {
  return {
    familyId: 'family-1',
    currentMember: parent,
    isParentOrAdmin: true,
    members: [parent, child],
    chores: [],
    latestCompletionFor: () => null,
    activities: [],
    medicalRecords: [],
    voteRounds: [],
    planEntries: [
      makeMealPlanEntry({ id: 'breakfast', entry_date: '2026-07-15', meal_slot: 'breakfast', status: 'confirmed' }),
      makeMealPlanEntry({ id: 'lunch', entry_date: '2026-07-15', meal_slot: 'lunch', status: 'confirmed' }),
      makeMealPlanEntry({ id: 'dinner', entry_date: '2026-07-15', meal_slot: 'dinner', status: 'confirmed' }),
    ],
    pendingCompletions: [],
    shoppingItems: [],
    preferences: defaultNotificationPreferences(parent.id, 'family-1', 'UTC'),
    copy,
    now: NOW,
    ...overrides,
  }
}

function completion(overrides: Partial<ChoreCompletion> = {}): ChoreCompletion {
  return {
    id: 'completion-1', chore_id: 'chore-1', completed_by: child.id,
    completed_at: NOW.toISOString(), status: 'pending_approval', approved_by: null,
    approved_at: null, occurrence_due_date: '2026-07-14', chore_title: 'Tidy', reward_amount: 10,
    ...overrides,
  }
}

function shoppingItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: 'shopping-1', family_id: 'family-1', name: 'Milk', normalized_name: 'milk', quantity: 1,
    unit: 'l', note: null, category: 'dairy', created_by_member_id: child.id,
    responsible_member_id: parent.id, purchased: false, purchased_by_member_id: null,
    purchased_at: null, archived_at: null, source_meal_id: null, source_meal_plan_entry_id: null,
    sort_order: 0, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...overrides,
  }
}

describe('reminder rule engine', () => {
  it('groups chores due today and keeps a deterministic occurrence identity', () => {
    const chores = [
      makeChore({ id: 'a', assigned_to: child.id, due_date: '2026-07-14' }),
      makeChore({ id: 'b', assigned_to: child.id, due_date: '2026-07-14' }),
    ]
    const first = generateReminderDrafts(baseInput({ chores }))
    const second = generateReminderDrafts(baseInput({ chores }))
    expect(first.filter((item) => item.type === 'chore-due-today')).toHaveLength(1)
    expect(first.find((item) => item.type === 'chore-due-today')?.metadata.sourceIds).toEqual(['a', 'b'])
    expect(second.map((item) => item.dedupeKey)).toEqual(first.map((item) => item.dedupeKey))
  })

  it('creates an important overdue chore reminder and resolves from generation after completion', () => {
    const chore = makeChore({ assigned_to: child.id, due_date: '2026-07-13' })
    expect(generateReminderDrafts(baseInput({ chores: [chore] })).find((item) => item.type === 'chore-overdue')?.importance).toBe('important')
    expect(generateReminderDrafts(baseInput({ chores: [chore], latestCompletionFor: () => completion({ status: 'approved', occurrence_due_date: chore.due_date ?? undefined }) })).some((item) => item.source === 'chore')).toBe(false)
  })

  it('uses the recurring chore due date as the occurrence identity', () => {
    const first = generateReminderDrafts(baseInput({ chores: [makeChore({ id: 'repeat', assigned_to: child.id, due_date: '2026-07-14', recurrence_type: 'weekly', recurring: true })] }))
    const next = generateReminderDrafts(baseInput({ chores: [makeChore({ id: 'repeat', assigned_to: child.id, due_date: '2026-07-21', recurrence_type: 'weekly', recurring: true })], now: new Date('2026-07-21T10:00:00Z') }))
    expect(first.find((item) => item.source === 'chore')?.dedupeKey).not.toBe(next.find((item) => item.source === 'chore')?.dedupeKey)
  })

  it('creates starts-soon and responsibility-aware payment reminders', () => {
    const activity = makeActivity({
      start_date: '2026-07-15', reminder_enabled: true, reminder_days_before: 1,
      responsible_member_id: parent.id, next_payment_due_date: '2026-07-15', payment_amount: 500,
    })
    const reminders = generateReminderDrafts(baseInput({ activities: [activity] }))
    expect(reminders.some((item) => item.type === 'activity-starts-soon')).toBe(true)
    expect(reminders.some((item) => item.type === 'activity-payment-due')).toBe(true)
  })

  it('does not notify another guardian when a responsible parent is explicit', () => {
    const activity = makeActivity({ start_date: '2026-07-15', reminder_enabled: true, reminder_days_before: 1, responsible_member_id: parent.id, next_payment_due_date: '2026-07-15' })
    const appointment = makeMedicalRecord({ patient_id: child.id, responsible_member_id: parent.id, record_date: '2026-07-15' })
    const reminders = generateReminderDrafts(baseInput({
      currentMember: otherParent, isParentOrAdmin: true, members: [parent, otherParent, child],
      preferences: defaultNotificationPreferences(otherParent.id, 'family-1', 'UTC'), activities: [activity], medicalRecords: [appointment],
    }))
    expect(reminders.some((item) => item.source === 'activity' || item.source === 'activity-payment' || item.source === 'medical-appointment')).toBe(false)
  })

  it('removes a paid activity payment until the next due date advances', () => {
    const paid = makeActivity({ responsible_member_id: parent.id, next_payment_due_date: '2026-07-14', payment_paid_at: '2026-07-13T09:00:00Z', payment_paid_for_date: '2026-07-14' })
    expect(generateReminderDrafts(baseInput({ activities: [paid] })).some((item) => item.source === 'activity-payment')).toBe(false)
    const next = { ...paid, next_payment_due_date: '2026-07-20' }
    expect(generateReminderDrafts(baseInput({ activities: [next] })).some((item) => item.source === 'activity-payment')).toBe(true)
  })

  it('uses safe medical preview text and supports vaccination due reminders', () => {
    const appointment = makeMedicalRecord({ id: 'appointment', patient_id: child.id, responsible_member_id: parent.id, record_date: '2026-07-15', title: 'Sensitive diagnosis' })
    const vaccination = makeMedicalRecord({ id: 'vaccine', patient_id: child.id, responsible_member_id: parent.id, record_type: 'vaccination', vaccine_next_dose_date: '2026-07-14' })
    const reminders = generateReminderDrafts(baseInput({ medicalRecords: [appointment, vaccination] }))
    const medical = reminders.find((item) => item.type === 'medical-appointment-tomorrow')
    expect(medical?.title).toBe('Medical appointment tomorrow')
    expect(JSON.stringify(medical)).not.toContain('Sensitive diagnosis')
    expect(reminders.find((item) => item.type === 'vaccination-due')?.importance).toBe('important')
  })

  it('notifies only a member who has not voted before the deadline', () => {
    const round: MealVoteRound = {
      id: 'round', family_id: 'family-1', title: 'Dinner', description: null, status: 'open',
      deadline_at: '2026-07-15T10:00:00Z', created_by: 'user', created_at: NOW.toISOString(), closed_at: null,
      candidates: [makeMealVoteCandidate({ votes: [] })],
    }
    expect(generateReminderDrafts(baseInput({ voteRounds: [round] })).some((item) => item.source === 'voting')).toBe(true)
    round.candidates[0].votes = [makeMealVote({ member_id: parent.id })]
    expect(generateReminderDrafts(baseInput({ voteRounds: [round] })).some((item) => item.source === 'voting')).toBe(false)
  })

  it('creates one grouped empty or incomplete meal reminder and respects skipped slots', () => {
    const empty = generateReminderDrafts(baseInput({ planEntries: [] })).filter((item) => item.source === 'meal-plan')
    expect(empty).toHaveLength(1)
    expect(empty[0].type).toBe('meal-plan-empty')
    const partial = generateReminderDrafts(baseInput({ planEntries: [makeMealPlanEntry({ entry_date: '2026-07-15', meal_slot: 'dinner', status: 'confirmed' })] })).find((item) => item.source === 'meal-plan')
    expect(partial?.metadata.count).toBe(2)
    const skipped = ['breakfast', 'lunch', 'dinner'].map((meal_slot, index) => makeMealPlanEntry({ id: `skip-${index}`, entry_date: '2026-07-15', meal_slot: meal_slot as 'breakfast' | 'lunch' | 'dinner', status: 'skipped' }))
    expect(generateReminderDrafts(baseInput({ planEntries: skipped })).some((item) => item.source === 'meal-plan')).toBe(false)
  })

  it('updates the same grouped meal reminder as slots are planned', () => {
    const empty = generateReminderDrafts(baseInput({ planEntries: [] })).find((item) => item.source === 'meal-plan')
    const partial = generateReminderDrafts(baseInput({ planEntries: [makeMealPlanEntry({ entry_date: '2026-07-15', meal_slot: 'breakfast' })] })).find((item) => item.source === 'meal-plan')
    expect(partial?.dedupeKey).toBe(empty?.dedupeKey)
    expect(partial?.metadata.count).toBe(2)
  })

  it('keeps grouped chore and allowance identities while some children resolve', () => {
    const chores = [makeChore({ id: 'a', assigned_to: child.id, due_date: '2026-07-14' }), makeChore({ id: 'b', assigned_to: child.id, due_date: '2026-07-14' })]
    const twoChores = generateReminderDrafts(baseInput({ chores })).find((item) => item.source === 'chore')
    const oneChore = generateReminderDrafts(baseInput({ chores: chores.slice(1) })).find((item) => item.source === 'chore')
    expect(oneChore?.dedupeKey).toBe(twoChores?.dedupeKey)
    expect(oneChore?.metadata.count).toBe(1)

    const approvals = [completion({ id: 'a' }), completion({ id: 'b' })]
    const twoApprovals = generateReminderDrafts(baseInput({ pendingCompletions: approvals })).find((item) => item.source === 'allowance')
    const oneApproval = generateReminderDrafts(baseInput({ pendingCompletions: approvals.slice(1) })).find((item) => item.source === 'allowance')
    expect(oneApproval?.dedupeKey).toBe(twoApprovals?.dedupeKey)
    expect(oneApproval?.metadata.count).toBe(1)
  })

  it('groups pending approvals only for approvers', () => {
    expect(generateReminderDrafts(baseInput({ pendingCompletions: [completion(), completion({ id: 'completion-2' })] })).find((item) => item.source === 'allowance')?.metadata.count).toBe(2)
    const childInput = baseInput({ currentMember: child, isParentOrAdmin: false, preferences: defaultNotificationPreferences(child.id, 'family-1', 'UTC'), pendingCompletions: [completion()] })
    expect(generateReminderDrafts(childInput).some((item) => item.source === 'allowance')).toBe(false)
  })

  it.each([30, 7, 1])('creates a document threshold reminder at %i days', (threshold) => {
    const documents: ReminderDocument[] = [{ id: `doc-${threshold}`, family_id: 'family-1', title: 'Passport', expires_on: `2026-${threshold === 30 ? '08-13' : threshold === 7 ? '07-21' : '07-15'}`, important: false, responsible_member_id: parent.id, status: 'active' }]
    expect(generateReminderDrafts(baseInput({ documents })).find((item) => item.source === 'document')?.metadata.thresholdDays).toBe(threshold)
  })

  it('keeps an expired important document overdue', () => {
    const documents: ReminderDocument[] = [{ id: 'doc', family_id: 'family-1', title: 'Passport', expires_on: '2026-07-01', important: true, responsible_member_id: parent.id, status: 'active' }]
    const reminder = generateReminderDrafts(baseInput({ documents })).find((item) => item.source === 'document')
    expect(reminder).toMatchObject({ type: 'document-expired', importance: 'important', deepLink: null })
  })

  it('groups newly assigned shopping and removes purchased items', () => {
    const items = [shoppingItem(), shoppingItem({ id: 'shopping-2', name: 'Bread' })]
    expect(generateReminderDrafts(baseInput({ shoppingItems: items })).find((item) => item.source === 'shopping')?.metadata.count).toBe(2)
    expect(generateReminderDrafts(baseInput({ shoppingItems: items.map((item) => ({ ...item, purchased: true })) })).some((item) => item.source === 'shopping')).toBe(false)
  })

  it('updates a partial shopping group and moves it on reassignment', () => {
    const items = Array.from({ length: 5 }, (_, index) => shoppingItem({ id: `shopping-${index}`, name: `Item ${index}` }))
    const five = generateReminderDrafts(baseInput({ shoppingItems: items })).find((item) => item.source === 'shopping')
    const remaining = items.map((item, index) => index < 3 ? { ...item, purchased: true } : item)
    const two = generateReminderDrafts(baseInput({ shoppingItems: remaining })).find((item) => item.source === 'shopping')
    expect(two?.dedupeKey).toBe(five?.dedupeKey)
    expect(two?.metadata.count).toBe(2)

    const reassigned = items.map((item) => ({ ...item, responsible_member_id: otherParent.id }))
    expect(generateReminderDrafts(baseInput({ shoppingItems: reassigned })).some((item) => item.source === 'shopping')).toBe(false)
    const newRecipient = generateReminderDrafts(baseInput({ currentMember: otherParent, members: [parent, otherParent, child], preferences: defaultNotificationPreferences(otherParent.id, 'family-1', 'UTC'), shoppingItems: reassigned }))
    expect(newRecipient.find((item) => item.source === 'shopping')?.metadata.count).toBe(5)
  })

  it('does not notify a member about shopping assigned by themself', () => {
    expect(generateReminderDrafts(baseInput({ shoppingItems: [shoppingItem({ created_by_member_id: parent.id })] })).some((item) => item.source === 'shopping')).toBe(false)
  })
})

describe('preferences, lifecycle and time', () => {
  it('suppresses disabled categories while quiet reminders stay in-app', () => {
    const preferences = defaultNotificationPreferences(parent.id, 'family-1', 'UTC')
    preferences.categories.chores = false
    const generated = generateReminderDrafts(baseInput({ preferences, chores: [makeChore({ due_date: '2026-07-14' })], planEntries: [] }))
    expect(generated.some((item) => item.source === 'chore')).toBe(false)
    expect(generated.find((item) => item.source === 'meal-plan')?.importance).toBe('quiet')
    expect(applyReminderPreferences(generated, { ...preferences, inAppEnabled: false })).toEqual([])
  })

  it('restores the same currently actionable occurrence when a category is re-enabled', () => {
    const chore = makeChore({ assigned_to: child.id, due_date: '2026-07-14' })
    const enabled = defaultNotificationPreferences(parent.id, 'family-1', 'UTC')
    const before = generateReminderDrafts(baseInput({ preferences: enabled, chores: [chore] })).find((item) => item.source === 'chore')
    const disabled = { ...enabled, categories: { ...enabled.categories, chores: false } }
    expect(generateReminderDrafts(baseInput({ preferences: disabled, chores: [chore] })).some((item) => item.source === 'chore')).toBe(false)
    const after = generateReminderDrafts(baseInput({ preferences: enabled, chores: [chore] })).find((item) => item.source === 'chore')
    expect(after?.dedupeKey).toBe(before?.dedupeKey)
  })

  it('distinguishes unread, read, resolved and dismissed state', () => {
    expect(reminderStatus({ readAt: null, resolvedAt: null, dismissedAt: null })).toBe('unread')
    expect(reminderStatus({ readAt: NOW.toISOString(), resolvedAt: null, dismissedAt: null })).toBe('read')
    expect(reminderStatus({ readAt: null, resolvedAt: NOW.toISOString(), dismissedAt: null })).toBe('resolved')
    expect(reminderStatus({ readAt: null, resolvedAt: null, dismissedAt: NOW.toISOString() })).toBe('dismissed')
  })

  it('uses the configured timezone across a midnight boundary', () => {
    const instant = new Date('2026-07-14T23:30:00Z')
    expect(todayInTimeZone(instant, 'UTC')).toBe('2026-07-14')
    expect(todayInTimeZone(instant, 'Europe/Prague')).toBe('2026-07-15')
  })

  it('distinguishes automatic timezone defaults and rejects invalid zones', () => {
    expect(defaultNotificationPreferences('m', 'f', 'UTC').timezoneMode).toBe('auto')
    expect(isValidTimeZone('Europe/Prague')).toBe(true)
    expect(isValidTimeZone('Not/A_Real_Zone')).toBe(false)
  })

  it('keeps local dates stable across a daylight-saving transition', () => {
    expect(todayInTimeZone(new Date('2026-03-29T00:30:00Z'), 'Europe/Prague')).toBe('2026-03-29')
    expect(todayInTimeZone(new Date('2026-03-29T01:30:00Z'), 'Europe/Prague')).toBe('2026-03-29')
  })
})

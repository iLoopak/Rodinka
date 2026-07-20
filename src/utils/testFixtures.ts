import type { Chore } from '../hooks/useChores'
import type { Activity } from '../hooks/useActivities'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import type { MealVote, MealVoteCandidate, VoteValue } from '../features/meals/domain/mealTypes'
import type { Meal } from '../features/meals/domain/mealTypes'
import type { MealPlanEntry } from '../features/meals/domain/mealTypes'
import type { FamilyMember } from '../hooks/useFamilyMembers'

// Small factories for the pure-logic tests — only the fields a given test
// cares about need to be overridden, everything else gets a harmless
// default so fixtures stay short and intention-revealing at call sites.

export function makeFamilyMember(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: 'member-1',
    family_id: 'family-1',
    display_name: 'Alex',
    role: 'child',
    user_id: null,
    birth_date: null,
    color_key: null,
    avatar_path: null,
    avatar_url: null,
    grammatical_gender: null,
    vocative_name: null,
    ...overrides,
  }
}

export function makeChore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: 'chore-1',
    family_id: 'family-1',
    title: 'Chore',
    description: null,
    assigned_to: 'member-1',
    due_date: '2026-07-13',
    reward_amount: 10,
    reward_enabled: true,
    reward_currency: 'CZK',
    requires_approval: true,
    category: null,
    priority: null,
    recurring: false,
    recurrence_type: 'none',
    recurrence_weekdays: null,
    preferred_day_of_month: null,
    status: 'active',
    sort_order: 0,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...overrides,
  }
}

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    family_id: 'family-1',
    title: 'Activity',
    category: 'other',
    kind: 'club',
    all_day: false,
    child_id: 'child-1',
    participant_ids: ['child-1'],
    responsible_member_id: null,
    secondary_responsible_member_id: null,
    location: null,
    coach_name: null,
    coach_phone: null,
    coach_email: null,
    notes: null,
    skill_level: null,
    start_date: '2026-07-01',
    end_date: null,
    recurrence_type: 'one_off',
    recurrence_weekdays: null,
    start_time: null,
    end_time: null,
    payment_amount: null,
    payment_frequency: null,
    next_payment_due_date: null,
    payment_paid_at: null,
    payment_paid_for_date: null,
    status: 'active',
    reminder_enabled: false,
    reminder_days_before: null,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    ...overrides,
  }
}

export function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    family_id: 'family-1',
    name: 'Meal',
    description: null,
    category: 'dinner',
    tags: [],
    prep_minutes: null,
    notes: null,
    source_url: null,
    status: 'active',
    created_by: 'user-1',
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    ...overrides,
  }
}

export function makeMealVote(overrides: Partial<MealVote> = {}): MealVote {
  return {
    id: 'vote-1',
    candidate_id: 'candidate-1',
    member_id: 'member-1',
    value: 1 as VoteValue,
    created_by: 'user-1',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...overrides,
  }
}

export function makeMealVoteCandidate(overrides: Partial<MealVoteCandidate> = {}): MealVoteCandidate {
  return {
    id: 'candidate-1',
    round_id: 'round-1',
    meal_id: 'meal-1',
    meal_title: 'Candidate meal',
    created_at: '2026-07-01T09:00:00Z',
    votes: [],
    ...overrides,
  }
}

export function makeMealPlanEntry(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return {
    id: 'plan-1',
    family_id: 'family-1',
    entry_date: '2026-07-13',
    meal_slot: 'dinner',
    meal_id: null,
    title: 'Custom meal',
    responsible_member_id: null,
    notes: null,
    status: 'proposed',
    origin: 'manual',
    source_entry_id: null,
    created_by: 'user-1',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...overrides,
  }
}

export function makeMedicalRecord(overrides: Partial<MedicalRecord> = {}): MedicalRecord {
  return {
    id: 'medical-1',
    family_id: 'family-1',
    patient_id: 'child-1',
    responsible_member_id: null,
    record_type: 'checkup',
    title: 'Checkup',
    provider: null,
    location: null,
    record_date: '2026-07-13',
    start_time: null,
    end_time: null,
    status: 'planned',
    notes: null,
    next_due_date: null,
    recurrence_interval_months: null,
    reminder_enabled: false,
    reminder_days_before: null,
    vaccine_name: null,
    vaccine_dose_number: null,
    vaccine_batch_number: null,
    vaccine_completed_date: null,
    vaccine_next_dose_date: null,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    ...overrides,
  }
}

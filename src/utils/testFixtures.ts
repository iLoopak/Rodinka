import type { Chore } from '../hooks/useChores'
import type { Activity } from '../hooks/useActivities'
import type { MedicalRecord } from '../hooks/useMedicalRecords'

// Small factories for the pure-logic tests — only the fields a given test
// cares about need to be overridden, everything else gets a harmless
// default so fixtures stay short and intention-revealing at call sites.

export function makeChore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: 'chore-1',
    family_id: 'family-1',
    title: 'Chore',
    description: null,
    assigned_to: 'member-1',
    due_date: '2026-07-13',
    reward_amount: 10,
    recurring: false,
    created_at: '2026-07-01T10:00:00Z',
    ...overrides,
  }
}

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    family_id: 'family-1',
    title: 'Activity',
    category: 'other',
    child_id: 'child-1',
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
    status: 'active',
    reminder_enabled: false,
    reminder_days_before: null,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
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

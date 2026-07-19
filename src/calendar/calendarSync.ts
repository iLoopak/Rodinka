import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import { normalizeChore } from '../utils/choreModel'
import type { CalendarMutation, CalendarSnapshotData } from './calendarTypes'

export interface CalendarRemote {
  fetchSnapshot(familyId: string): Promise<CalendarSnapshotData>
  applyMutation(mutation: CalendarMutation): Promise<void>
}

export interface CalendarSyncFailure {
  message: string
  retryable: boolean
}

export class SupabaseCalendarRemote implements CalendarRemote {
  async fetchSnapshot(familyId: string) {
    return fetchCalendarSnapshot(familyId)
  }

  async applyMutation(mutation: CalendarMutation) {
    const { error } = await supabase.rpc('apply_calendar_mutation', {
      p_operation_id: mutation.operationId,
      p_family_id: mutation.familyId,
      p_record_type: mutation.type,
      p_local_id: mutation.localId,
      p_payload: mutation.payload,
    })
    if (error) throw error
  }
}

export function classifyCalendarSyncError(error: unknown): CalendarSyncFailure {
  const candidate = error as Partial<PostgrestError> | null
  const code = typeof candidate?.code === 'string' ? candidate.code : ''
  const message = error instanceof Error ? error.message : typeof candidate?.message === 'string' ? candidate.message : String(error)
  // SQL validation, integrity and authorization failures need user action.
  // Connectivity, timeouts and 5xx-like gateway failures remain retryable.
  const permanent = code.startsWith('22') || code.startsWith('23') || code === '42501' || code === 'P0001'
  return { message, retryable: !permanent }
}

export async function fetchCalendarSnapshot(familyId: string): Promise<CalendarSnapshotData> {
  const { start, end } = snapshotRange(new Date())
  const [
    choresResult,
    completionsResult,
    activitiesResult,
    medicalResult,
    mealsResult,
    allowanceResult,
    overridesResult,
    assignmentHistoryResult,
    participantHistoryResult,
    membersResult,
  ] = await Promise.all([
    supabase.from('chores')
      .select('id, family_id, title, description, assigned_to, due_date, reward_amount, reward_enabled, reward_currency, requires_approval, category, priority, recurring, recurrence_type, recurrence_weekdays, preferred_day_of_month, status, sort_order, created_at, updated_at')
      .eq('family_id', familyId).gte('due_date', start).lte('due_date', end).order('due_date').limit(1500),
    supabase.from('chore_completions')
      .select('id, chore_id, completed_by, completed_at, status, approved_by, approved_at, occurrence_due_date, chore_title, reward_amount, assigned_member_id, assignment_was_override, requires_approval, reward_enabled, task_category, chores!inner(family_id)')
      .eq('chores.family_id', familyId).gte('occurrence_due_date', start).lte('occurrence_due_date', end).order('completed_at', { ascending: false }).limit(2000),
    supabase.from('activities')
      .select('id, family_id, title, category, kind, all_day, child_id, responsible_member_id, secondary_responsible_member_id, location, coach_name, coach_phone, coach_email, notes, skill_level, start_date, end_date, recurrence_type, recurrence_weekdays, start_time, end_time, payment_amount, payment_frequency, next_payment_due_date, payment_paid_at, payment_paid_for_date, status, reminder_enabled, reminder_days_before, created_at, updated_at, activity_participants(member_id)')
      .eq('family_id', familyId).lte('start_date', end).order('start_date').limit(1500),
    supabase.from('medical_records')
      .select('id, family_id, patient_id, responsible_member_id, record_type, title, provider, location, record_date, start_time, end_time, status, notes, next_due_date, recurrence_interval_months, reminder_enabled, reminder_days_before, vaccine_name, vaccine_dose_number, vaccine_batch_number, vaccine_completed_date, vaccine_next_dose_date, created_at, updated_at')
      .eq('family_id', familyId).order('record_date').limit(1500),
    supabase.from('meal_plan_entries')
      .select('id, family_id, entry_date, meal_slot, meal_id, title, responsible_member_id, notes, status, origin, source_entry_id, created_by, created_at, updated_at')
      .eq('family_id', familyId).gte('entry_date', start).lte('entry_date', end).order('entry_date').limit(1500),
    supabase.from('allowance_plans')
      .select('id, family_id, member_id, amount, frequency, payout_day, payout_weekday, note, starts_on, status, condition_mode, created_at, updated_at, allowance_plan_requirements(id, plan_id, chore_id, requirement_type, required_count, created_at)')
      .eq('family_id', familyId).order('created_at').limit(500),
    supabase.from('occurrence_overrides')
      .select('id, family_id, series_type, series_id, occurrence_date, companion_member_id, assignee_member_id, cancelled, updated_at')
      .eq('family_id', familyId).gte('occurrence_date', start).lte('occurrence_date', end).limit(2000),
    supabase.from('series_assignment_history')
      .select('id, family_id, series_type, series_id, effective_from, member_id')
      .eq('family_id', familyId).lte('effective_from', end).limit(2000),
    supabase.from('activity_participant_history')
      .select('id, family_id, activity_id, member_id, effective_from, effective_to')
      .eq('family_id', familyId).lte('effective_from', end).limit(2000),
    supabase.from('members')
      .select('id, family_id, display_name, role, user_id, birth_date, color_key, avatar_path, grammatical_gender, vocative_name, status, removed_at, removed_by_member_id, removal_reason')
      .eq('family_id', familyId).order('display_name').limit(500),
  ])

  const firstError = [
    choresResult.error, completionsResult.error, activitiesResult.error, medicalResult.error, mealsResult.error,
    allowanceResult.error, overridesResult.error, assignmentHistoryResult.error, participantHistoryResult.error, membersResult.error,
  ].find(Boolean)
  if (firstError) throw firstError

  const inRange = (value: string | null | undefined) => Boolean(value && value >= start && value <= end)
  const activities = (activitiesResult.data ?? [])
    .filter((activity) => activity.recurrence_type !== 'one_off'
      ? activity.status === 'active' && (!activity.end_date || activity.end_date >= start)
      : Boolean((activity.end_date ?? activity.start_date) >= start))
    .map((activity) => ({
      ...activity,
      participant_ids: activity.activity_participants.map((participant) => participant.member_id),
    }))
  const medicalRecords = (medicalResult.data ?? []).filter((record) =>
    inRange(record.record_date) || inRange(record.next_due_date) || inRange(record.vaccine_next_dose_date))

  return {
    chores: (choresResult.data ?? []).map((row) => normalizeChore(row)),
    completions: (completionsResult.data ?? []).map((row) => ({ ...row, reward_amount: Number(row.reward_amount) })),
    activities,
    medicalRecords,
    planEntries: mealsResult.data ?? [],
    allowancePlans: (allowanceResult.data ?? []).map((row) => ({
      ...row,
      amount: Number(row.amount),
      requirements: row.allowance_plan_requirements ?? [],
    })),
    occurrenceOverrides: overridesResult.data ?? [],
    assignmentHistory: assignmentHistoryResult.data ?? [],
    participantHistory: participantHistoryResult.data ?? [],
    members: (membersResult.data ?? []).map((member) => ({ ...member, status: member.status ?? 'active', avatar_url: null })),
    rangeStart: start,
    rangeEnd: end,
  } as CalendarSnapshotData
}

function snapshotRange(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 13, 0))
  return { start: isoDate(start), end: isoDate(end) }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

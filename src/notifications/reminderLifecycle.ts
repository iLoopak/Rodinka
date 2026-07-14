import type { Activity } from '../hooks/useActivities'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { MealPlanEntry } from '../hooks/useMealPlanEntries'
import type { MealVoteRound } from '../hooks/useMealVoteRounds'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import type { Chore } from '../utils/choreModel'
import type { ShoppingItem } from '../utils/shopping'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { OccurrenceOverride, SeriesAssignmentHistory } from '../utils/occurrenceAssignments'

export const REMINDER_FOREGROUND_REFRESH_MS = 15 * 60 * 1000
export const REMINDER_BACKGROUND_REFRESH_MS = 2 * 60 * 1000
export const REMINDER_INVALIDATION_KEY = 'rodinka:reminders:invalidate'

export interface ReminderSourceSnapshot {
  members: FamilyMember[]
  chores: Chore[]
  completions: ChoreCompletion[]
  activities: Activity[]
  medicalRecords: MedicalRecord[]
  voteRounds: MealVoteRound[]
  planEntries: MealPlanEntry[]
  shoppingItems: ShoppingItem[]
  occurrenceOverrides?: OccurrenceOverride[]
  assignmentHistory?: SeriesAssignmentHistory[]
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function buildReminderSourceFingerprint(snapshot: ReminderSourceSnapshot) {
  const tokens = [
    ...snapshot.members.map((item) => `u:${item.id}:${item.role}:${item.user_id ?? ''}:${item.birth_date ?? ''}`),
    ...snapshot.chores.map((item) => `c:${item.id}:${item.updated_at}:${item.assigned_to}:${item.due_date}:${item.status}`),
    ...snapshot.completions.map((item) => `x:${item.id}:${item.status}:${item.occurrence_due_date}:${item.approved_at ?? ''}`),
    ...snapshot.activities.map((item) => `a:${item.id}:${item.updated_at}:${item.responsible_member_id ?? ''}:${item.next_payment_due_date ?? ''}:${item.payment_paid_for_date ?? ''}:${item.status}`),
    ...snapshot.medicalRecords.map((item) => `m:${item.id}:${item.updated_at}:${item.responsible_member_id ?? ''}:${item.record_date}:${item.vaccine_next_dose_date ?? ''}:${item.status}`),
    ...snapshot.voteRounds.map((round) => `v:${round.id}:${round.created_at}:${round.closed_at ?? ''}:${round.status}:${round.deadline_at ?? ''}:${round.candidates.flatMap((candidate) => candidate.votes.map((vote) => `${vote.member_id}:${vote.value}:${vote.updated_at}`)).sort().join(',')}`),
    ...snapshot.planEntries.map((item) => `p:${item.id}:${item.updated_at}:${item.entry_date}:${item.meal_slot}:${item.status}`),
    ...snapshot.shoppingItems.map((item) => `s:${item.id}:${item.updated_at}:${item.responsible_member_id ?? ''}:${item.purchased}:${item.archived_at ?? ''}`),
    ...(snapshot.occurrenceOverrides ?? []).map((item) => `o:${item.id}:${item.series_type}:${item.series_id}:${item.occurrence_date}:${item.companion_member_id ?? ''}:${item.assignee_member_id ?? ''}:${item.updated_at}`),
    ...(snapshot.assignmentHistory ?? []).map((item) => `h:${item.id}:${item.series_type}:${item.series_id}:${item.effective_from}:${item.member_id ?? ''}`),
  ]
  return stableHash(tokens.sort().join('|'))
}

export function shouldRefreshAfterBackground(hiddenAt: number | null, now: number, threshold = REMINDER_BACKGROUND_REFRESH_MS) {
  return hiddenAt !== null && now - hiddenAt >= threshold
}

export type ReminderInvalidationKind = 'sources' | 'state' | 'preferences'

export interface ReminderInvalidationMessage {
  kind: ReminderInvalidationKind
  familyId: string
  memberId: string
  senderId: string
  fingerprint?: string
  at: number
}

export function parseReminderInvalidation(value: string | null): ReminderInvalidationMessage | null {
  if (!value) return null
  try {
    const message = JSON.parse(value) as Partial<ReminderInvalidationMessage>
    if (!['sources', 'state', 'preferences'].includes(message.kind ?? '')) return null
    if (!message.familyId || !message.memberId || !message.senderId || typeof message.at !== 'number') return null
    return message as ReminderInvalidationMessage
  } catch {
    return null
  }
}

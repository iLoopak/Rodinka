import type { ActivityInput } from '../domain/activities/types'
import type { Activity } from '../features/activities/domain/activityTypes'
import type { AllowancePlan } from '../hooks/useAllowancePlans'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { MealPlanEntry } from '../features/meals/domain/mealTypes'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import type { Chore, ChoreInput } from '../utils/choreModel'
import type { ActivityParticipantHistory, OccurrenceOverride, SeriesAssignmentHistory } from '../utils/occurrenceAssignments'

export const CALENDAR_LOCAL_SCHEMA_VERSION = 1

export interface CalendarSnapshotData {
  chores: Chore[]
  completions: ChoreCompletion[]
  activities: Activity[]
  medicalRecords: MedicalRecord[]
  planEntries: MealPlanEntry[]
  allowancePlans: AllowancePlan[]
  occurrenceOverrides: OccurrenceOverride[]
  assignmentHistory: SeriesAssignmentHistory[]
  participantHistory: ActivityParticipantHistory[]
  members: FamilyMember[]
  rangeStart: string
  rangeEnd: string
}

export type CalendarSnapshotDomain = Exclude<keyof CalendarSnapshotData, 'rangeStart' | 'rangeEnd'>
export type CalendarProviderSnapshot = Partial<Pick<CalendarSnapshotData, CalendarSnapshotDomain>>

export const CALENDAR_PROVIDER_DOMAINS: readonly CalendarSnapshotDomain[] = [
  'chores',
  'completions',
  'activities',
  'medicalRecords',
  'planEntries',
  'allowancePlans',
  'occurrenceOverrides',
  'assignmentHistory',
  'participantHistory',
  'members',
]

export type CalendarMutationStatus = 'pending' | 'syncing' | 'failed'
export type CalendarMutation = CalendarChoreMutation | CalendarActivityMutation

interface CalendarMutationBase {
  operationId: string
  scopeKey: string
  userId: string
  familyId: string
  currentMemberId: string
  localId: string
  createdAt: string
  attempts: number
  status: CalendarMutationStatus
  retryable: boolean
  error: string | null
}

export interface CalendarChoreMutation extends CalendarMutationBase {
  type: 'create_chore'
  payload: ChoreInput
}

export interface CalendarActivityMutation extends CalendarMutationBase {
  type: 'create_activity'
  payload: ActivityInput
}

export type CalendarSyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

export interface CalendarRepositorySnapshot {
  ready: boolean
  hasUsableData: boolean
  data: CalendarSnapshotData
  mutations: CalendarMutation[]
  pendingByLocalId: Map<string, CalendarMutation>
  status: CalendarSyncStatus
  lastSuccessfulSyncAt: string | null
  error: string | null
}

export function emptyCalendarData(): CalendarSnapshotData {
  return {
    chores: [],
    completions: [],
    activities: [],
    medicalRecords: [],
    planEntries: [],
    allowancePlans: [],
    occurrenceOverrides: [],
    assignmentHistory: [],
    participantHistory: [],
    members: [],
    rangeStart: '',
    rangeEnd: '',
  }
}

export function calendarScopeKey(userId: string, familyId: string) {
  return `${userId}:${familyId}`
}

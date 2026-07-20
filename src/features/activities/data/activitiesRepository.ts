import type { Activity } from '../domain/activityTypes'
import type { ActivityInput } from '../../../domain/activities/types'
import type {
  ActivityParticipantHistory,
  OccurrenceOverride,
  OccurrenceSeriesType,
  SeriesAssignmentHistory,
} from '../../../utils/occurrenceAssignments'

export interface ActivityScope {
  familyId: string
}

export type ActivityRealtimeChange =
  | { action: 'upsert'; record: Activity }
  | { action: 'delete'; id: string }
  /** activity_participants is a join table with no id of its own. */
  | { action: 'participant-add'; activityId: string; memberId: string }
  | { action: 'participant-remove'; activityId: string; memberId: string }

export interface ActivitiesRealtimeHandlers {
  onActivityChange: (change: ActivityRealtimeChange) => void
  onStatusChange: (status: string) => void
  /** A realtime row arrives without participants; the caller supplies the ones it holds. */
  resolveParticipants: (activityId: string) => string[] | undefined
}

/**
 * Series-level operations. An `Activity` here is the *series definition* — a
 * single occurrence is not a row, it is projected from the series by the pure
 * recurrence expansion in `utils/recurrence.ts`, then adjusted by overrides.
 * That split is why there is no `updateOccurrence` on this interface.
 */
export interface ActivitiesRepository {
  listActivities(scope: ActivityScope): Promise<Activity[]>
  getActivity(scope: ActivityScope, id: string): Promise<Activity>
  /** Creates the series and its participants in one server transaction. */
  createSeries(scope: ActivityScope, input: ActivityInput): Promise<Activity>
  updateSeries(scope: ActivityScope, id: string, input: ActivityInput): Promise<Activity>
  markPaymentPaid(scope: ActivityScope, id: string, dueDate: string): Promise<Activity>
  subscribe(scope: ActivityScope, handlers: ActivitiesRealtimeHandlers): () => void
}

export interface OccurrenceState {
  overrides: OccurrenceOverride[]
  assignmentHistory: SeriesAssignmentHistory[]
  participantHistory: ActivityParticipantHistory[]
}

export type OccurrenceRealtimeTable = 'overrides' | 'assignmentHistory' | 'participantHistory'

export interface OccurrencesRealtimeHandlers {
  onOverrideChange: (change: { action: 'upsert'; record: OccurrenceOverride } | { action: 'delete'; id: string }) => void
  onAssignmentHistoryChange: (change: { action: 'upsert'; record: SeriesAssignmentHistory } | { action: 'delete'; id: string }) => void
  onParticipantHistoryChange: (change: { action: 'upsert'; record: ActivityParticipantHistory } | { action: 'delete'; id: string }) => void
  onStatusChange: (status: string) => void
}

/**
 * Occurrence overrides and assignment history span two domains: their
 * `series_type` is `'task' | 'activity'`, so chores and activities share them.
 * They therefore get their own repository rather than living under either
 * feature — which is also why this file exposes two interfaces.
 *
 * The two history tables are append-only audit records. There is deliberately
 * no update or delete operation for them: rewriting history would destroy the
 * answer to "who was assigned on this date", which is the only thing they are
 * for.
 */
export interface OccurrencesRepository {
  loadOccurrenceState(scope: ActivityScope): Promise<OccurrenceState>
  /**
   * Server-side transaction. Passing `restoreDefault` clears the override and
   * lets the series assignment apply again.
   */
  setMemberOverride(input: {
    seriesType: OccurrenceSeriesType
    seriesId: string
    occurrenceDate: string
    memberId: string | null
    restoreDefault: boolean
  }): Promise<void>
  subscribe(scope: ActivityScope, handlers: OccurrencesRealtimeHandlers): () => void
}

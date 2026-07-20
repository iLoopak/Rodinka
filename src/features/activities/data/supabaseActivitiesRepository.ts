import { supabase } from '../../../supabaseClient'
import { createRealtimeSubscription } from '../../../realtime/createRealtimeSubscription'
import { activityInputToRow, type ActivityInput } from '../../../domain/activities/types'
import { toActivitiesError, type ActivitiesOperation } from '../domain/activityErrors'
import {
  ACTIVITY_COLUMNS,
  ACTIVITY_PARTICIPANT_HISTORY_COLUMNS,
  OCCURRENCE_OVERRIDE_COLUMNS,
  SERIES_ASSIGNMENT_HISTORY_COLUMNS,
  mapActivity,
  mapActivityParticipantHistory,
  mapOccurrenceOverride,
  mapSeriesAssignmentHistory,
} from '../domain/activityMappers'
import type {
  ActivitiesRealtimeHandlers,
  ActivitiesRepository,
  ActivityScope,
  OccurrencesRealtimeHandlers,
  OccurrencesRepository,
} from './activitiesRepository'
import type { OccurrenceSeriesType } from '../../../utils/occurrenceAssignments'

type Row = Record<string, unknown>

async function run<T>(operation: ActivitiesOperation, work: () => PromiseLike<{ data: unknown; error: unknown }>, map: (data: unknown) => T): Promise<T> {
  let result: { data: unknown; error: unknown }
  try {
    result = await work()
  } catch (error) {
    throw toActivitiesError(operation, error)
  }
  if (result.error) throw toActivitiesError(operation, result.error)
  return map(result.data)
}

const rows = (data: unknown): Row[] => Array.isArray(data) ? (data as Row[]) : []

export class SupabaseActivitiesRepository implements ActivitiesRepository {
  async listActivities(scope: ActivityScope) {
    return run('activities.list',
      () => supabase.from('activities').select(ACTIVITY_COLUMNS).eq('family_id', scope.familyId).order('start_date'),
      (data) => rows(data).map((row) => mapActivity(row)))
  }

  async getActivity(scope: ActivityScope, id: string) {
    return run('activities.get',
      () => supabase.from('activities').select(ACTIVITY_COLUMNS).eq('id', id).eq('family_id', scope.familyId).single(),
      (data) => mapActivity(data as Row))
  }

  /**
   * The RPC writes the series and its participants in one transaction and
   * returns the new id, so a single targeted read replaces what used to be a
   * reload of every activity in the family.
   */
  async createSeries(scope: ActivityScope, input: ActivityInput) {
    const id = await run('activities.createSeries',
      () => supabase.rpc('create_activity_with_participants', {
        activity_data: { family_id: scope.familyId, ...activityInputToRow(input) },
        participant_ids: input.participantIds,
      }),
      (data) => String(data))
    return this.getActivity(scope, id)
  }

  async updateSeries(scope: ActivityScope, id: string, input: ActivityInput) {
    await run('activities.updateSeries',
      () => supabase.rpc('update_activity_with_participants', {
        target_activity_id: id,
        activity_data: activityInputToRow(input),
        participant_ids: input.participantIds,
      }),
      () => undefined)
    return this.getActivity(scope, id)
  }

  async markPaymentPaid(scope: ActivityScope, id: string, dueDate: string) {
    return run('activities.markPaymentPaid',
      () => supabase.from('activities')
        .update({ payment_paid_at: new Date().toISOString(), payment_paid_for_date: dueDate })
        .eq('id', id).eq('family_id', scope.familyId)
        .select(ACTIVITY_COLUMNS).single(),
      (data) => mapActivity(data as Row))
  }

  subscribe(scope: ActivityScope, handlers: ActivitiesRealtimeHandlers) {
    return createRealtimeSubscription({
      channelName: `family:${scope.familyId}:activities`,
      owner: 'ActivitiesRepository',
      openReason: 'provider-mount',
      onStatusChange: handlers.onStatusChange,
      tables: [
        {
          table: 'activities',
          filter: `family_id=eq.${scope.familyId}`,
          // An INSERT arrives with no participants; the create RPC's
          // activity_participants rows follow as their own events and heal it.
          // An UPDATE keeps whatever participants the entity already had
          // rather than blanking them.
          onInsert: (row) => handlers.onActivityChange({ action: 'upsert', record: mapActivity(row, []) }),
          onUpdate: (row) => handlers.onActivityChange({
            action: 'upsert',
            record: mapActivity(row, handlers.resolveParticipants(String(row.id)) ?? []),
          }),
          onDelete: (row) => handlers.onActivityChange({ action: 'delete', id: String(row.id) }),
        },
        {
          // Composite key (activity_id, member_id) and no family_id column, so
          // there is no filter and no id to key on; RLS still scopes delivery.
          table: 'activity_participants',
          onInsert: (row) => handlers.onActivityChange({
            action: 'participant-add', activityId: String(row.activity_id), memberId: String(row.member_id),
          }),
          onDelete: (row) => handlers.onActivityChange({
            action: 'participant-remove', activityId: String(row.activity_id), memberId: String(row.member_id),
          }),
        },
      ],
    })
  }
}

export class SupabaseOccurrencesRepository implements OccurrencesRepository {
  async loadOccurrenceState(scope: ActivityScope) {
    const [overrides, assignmentHistory, participantHistory] = await Promise.all([
      run('occurrences.list',
        () => supabase.from('occurrence_overrides').select(OCCURRENCE_OVERRIDE_COLUMNS).eq('family_id', scope.familyId),
        (data) => rows(data).map(mapOccurrenceOverride)),
      run('occurrences.list',
        () => supabase.from('series_assignment_history').select(SERIES_ASSIGNMENT_HISTORY_COLUMNS).eq('family_id', scope.familyId),
        (data) => rows(data).map(mapSeriesAssignmentHistory)),
      run('occurrences.list',
        () => supabase.from('activity_participant_history').select(ACTIVITY_PARTICIPANT_HISTORY_COLUMNS).eq('family_id', scope.familyId),
        (data) => rows(data).map(mapActivityParticipantHistory)),
    ])
    return { overrides, assignmentHistory, participantHistory }
  }

  async setMemberOverride(input: {
    seriesType: OccurrenceSeriesType
    seriesId: string
    occurrenceDate: string
    memberId: string | null
    restoreDefault: boolean
  }) {
    await run('occurrences.setMemberOverride',
      () => supabase.rpc('set_occurrence_member_override', {
        p_series_type: input.seriesType,
        p_series_id: input.seriesId,
        p_occurrence_date: input.occurrenceDate,
        p_member_id: input.memberId,
        p_restore_default: input.restoreDefault,
      }),
      () => undefined)
  }

  subscribe(scope: ActivityScope, handlers: OccurrencesRealtimeHandlers) {
    return createRealtimeSubscription({
      channelName: `family:${scope.familyId}:occurrence-assignments`,
      owner: 'OccurrencesRepository',
      openReason: 'provider-mount',
      onStatusChange: handlers.onStatusChange,
      tables: [
        {
          table: 'occurrence_overrides',
          filter: `family_id=eq.${scope.familyId}`,
          onInsert: (row) => handlers.onOverrideChange({ action: 'upsert', record: mapOccurrenceOverride(row) }),
          onUpdate: (row) => handlers.onOverrideChange({ action: 'upsert', record: mapOccurrenceOverride(row) }),
          onDelete: (row) => handlers.onOverrideChange({ action: 'delete', id: String(row.id) }),
        },
        {
          // Append-only: an insert is the whole story, and a delete only ever
          // arrives when a series is removed outright.
          table: 'series_assignment_history',
          filter: `family_id=eq.${scope.familyId}`,
          onInsert: (row) => handlers.onAssignmentHistoryChange({ action: 'upsert', record: mapSeriesAssignmentHistory(row) }),
          onUpdate: (row) => handlers.onAssignmentHistoryChange({ action: 'upsert', record: mapSeriesAssignmentHistory(row) }),
          onDelete: (row) => handlers.onAssignmentHistoryChange({ action: 'delete', id: String(row.id) }),
        },
        {
          table: 'activity_participant_history',
          filter: `family_id=eq.${scope.familyId}`,
          onInsert: (row) => handlers.onParticipantHistoryChange({ action: 'upsert', record: mapActivityParticipantHistory(row) }),
          onUpdate: (row) => handlers.onParticipantHistoryChange({ action: 'upsert', record: mapActivityParticipantHistory(row) }),
          onDelete: (row) => handlers.onParticipantHistoryChange({ action: 'delete', id: String(row.id) }),
        },
      ],
    })
  }
}

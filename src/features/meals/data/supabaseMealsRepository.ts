import { supabase } from '../../../supabaseClient'
import { createRealtimeSubscription } from '../../../realtime/createRealtimeSubscription'
import { toMealsError, type MealsOperation } from '../domain/mealErrors'
import {
  MEAL_COLUMNS,
  MEAL_PLAN_ENTRY_COLUMNS,
  MEAL_VOTE_ROUND_COLUMNS,
  mapMeal,
  mapMealPlanEntry,
  mapMealVoteRound,
  mealInputToRow,
  planEntryInputToRow,
} from '../domain/mealMappers'
import type { CopyableEntryInput } from '../../../utils/mealPlanGrouping'
import type {
  FamilyScope,
  MealInput,
  PlanEntryInput,
  VoteValue,
} from '../domain/mealTypes'
import type { MealCandidateDraft, MealsRealtimeHandlers, MealsRepository, VoteRoundDraft } from './mealsRepository'

type Row = Record<string, unknown>

/** Every Supabase result funnels through here, so no raw error escapes. */
async function run<T>(operation: MealsOperation, work: () => PromiseLike<{ data: unknown; error: unknown }>, map: (data: unknown) => T): Promise<T> {
  let result: { data: unknown; error: unknown }
  try {
    result = await work()
  } catch (error) {
    throw toMealsError(operation, error)
  }
  if (result.error) throw toMealsError(operation, result.error)
  return map(result.data)
}

const rows = (data: unknown): Row[] => Array.isArray(data) ? (data as Row[]) : []

export class SupabaseMealsRepository implements MealsRepository {
  async listMealLibrary(scope: FamilyScope) {
    return run('meals.list',
      () => supabase.from('meals').select(MEAL_COLUMNS).eq('family_id', scope.familyId).order('name'),
      (data) => rows(data).map(mapMeal))
  }

  async createMeal(scope: FamilyScope, input: MealInput) {
    // `.select().single()` so the caller can merge the created row instead of
    // reloading the library. Same for every mutation below.
    return run('meals.create',
      () => supabase.from('meals')
        .insert({ family_id: scope.familyId, created_by: scope.userId, ...mealInputToRow(input) })
        .select(MEAL_COLUMNS).single(),
      (data) => mapMeal(data as Row))
  }

  async updateMealDetails(id: string, input: MealInput) {
    return run('meals.update',
      () => supabase.from('meals')
        .update({ ...mealInputToRow(input), updated_at: new Date().toISOString() })
        .eq('id', id).select(MEAL_COLUMNS).single(),
      (data) => mapMeal(data as Row))
  }

  async listPlanEntries(scope: FamilyScope) {
    return run('plan.list',
      () => supabase.from('meal_plan_entries').select(MEAL_PLAN_ENTRY_COLUMNS).eq('family_id', scope.familyId).order('entry_date'),
      (data) => rows(data).map(mapMealPlanEntry))
  }

  async planMeal(scope: FamilyScope, input: PlanEntryInput) {
    return run('plan.create',
      () => supabase.from('meal_plan_entries')
        .insert({ family_id: scope.familyId, created_by: scope.userId, ...planEntryInputToRow(input) })
        .select(MEAL_PLAN_ENTRY_COLUMNS).single(),
      (data) => mapMealPlanEntry(data as Row))
  }

  async reschedulePlanEntry(id: string, input: PlanEntryInput) {
    return run('plan.update',
      () => supabase.from('meal_plan_entries')
        .update({ ...planEntryInputToRow(input), updated_at: new Date().toISOString() })
        .eq('id', id).select(MEAL_PLAN_ENTRY_COLUMNS).single(),
      (data) => mapMealPlanEntry(data as Row))
  }

  async removePlanEntry(id: string) {
    await run('plan.delete',
      () => supabase.from('meal_plan_entries').delete().eq('id', id),
      () => undefined)
  }

  async copyPlanWeek(scope: FamilyScope, entries: CopyableEntryInput[]) {
    if (entries.length === 0) return []
    const payload = entries.map((entry) => ({
      family_id: scope.familyId,
      created_by: scope.userId,
      entry_date: entry.entry_date,
      meal_slot: entry.meal_slot,
      meal_id: entry.meal_id,
      title: entry.title,
      responsible_member_id: entry.responsible_member_id,
      notes: entry.notes,
      status: 'proposed',
      origin: 'copied',
    }))
    return run('plan.copyWeek',
      () => supabase.from('meal_plan_entries').insert(payload).select(MEAL_PLAN_ENTRY_COLUMNS),
      (data) => rows(data).map(mapMealPlanEntry))
  }

  async listVoteRounds(scope: FamilyScope) {
    return run('voting.list',
      () => supabase.from('meal_vote_rounds').select(MEAL_VOTE_ROUND_COLUMNS)
        .eq('family_id', scope.familyId).order('created_at', { ascending: false }),
      (data) => rows(data).map((row) => mapMealVoteRound(row)))
  }

  /** Reads one round back with its nested candidates and votes. */
  private async fetchRound(operation: MealsOperation, roundId: string) {
    return run(operation,
      () => supabase.from('meal_vote_rounds').select(MEAL_VOTE_ROUND_COLUMNS).eq('id', roundId).single(),
      (data) => mapMealVoteRound(data as Row))
  }

  async createVoteRound(scope: FamilyScope, draft: VoteRoundDraft, candidates: MealCandidateDraft[], openImmediately: boolean) {
    const round = await run('voting.createRound',
      () => supabase.from('meal_vote_rounds').insert({
        family_id: scope.familyId,
        created_by: scope.userId,
        title: draft.title,
        description: draft.description || null,
        deadline_at: draft.deadlineAt,
      }).select('id').single(),
      (data) => data as { id: string })

    if (candidates.length > 0) {
      await run('voting.createRound',
        () => supabase.from('meal_vote_candidates').insert(candidates.map((candidate) => ({
          round_id: round.id,
          meal_id: candidate.mealId,
          meal_title: candidate.mealTitle,
        }))),
        () => undefined)
    }

    if (openImmediately) {
      await run('voting.openRound',
        () => supabase.rpc('open_vote_round', { round_id: round.id }),
        () => undefined)
    }

    return this.fetchRound('voting.createRound', round.id)
  }

  async addCandidates(roundId: string, candidates: MealCandidateDraft[]) {
    if (candidates.length > 0) {
      await run('voting.addCandidates',
        () => supabase.from('meal_vote_candidates').insert(candidates.map((candidate) => ({
          round_id: roundId,
          meal_id: candidate.mealId,
          meal_title: candidate.mealTitle,
        }))),
        () => undefined)
    }
    return this.fetchRound('voting.addCandidates', roundId)
  }

  async openVoteRound(roundId: string) {
    await run('voting.openRound', () => supabase.rpc('open_vote_round', { round_id: roundId }), () => undefined)
    return this.fetchRound('voting.openRound', roundId)
  }

  async closeVoteRound(roundId: string) {
    // Closing runs server-side side effects (winner selection), so the round
    // is read back rather than patched from the request payload.
    await run('voting.closeRound', () => supabase.rpc('close_vote_round', { round_id: roundId }), () => undefined)
    return this.fetchRound('voting.closeRound', roundId)
  }

  async recordVote(scope: FamilyScope, roundId: string, candidateId: string, memberId: string, value: VoteValue) {
    await run('voting.castVote',
      () => supabase.from('meal_votes').upsert(
        { candidate_id: candidateId, member_id: memberId, value, created_by: scope.userId, updated_at: new Date().toISOString() },
        { onConflict: 'candidate_id,member_id' },
      ),
      () => undefined)
    // Read the round back rather than embedding a join in the upsert: the
    // aggregate the UI renders is the round, and one extra read is cheaper
    // than a returning-representation join that breaks quietly.
    return this.fetchRound('voting.castVote', roundId)
  }

  subscribe(scope: FamilyScope, handlers: MealsRealtimeHandlers) {
    return createRealtimeSubscription({
      channelName: `family:${scope.familyId}:meals`,
      owner: 'MealsRepository',
      openReason: 'provider-mount',
      onStatusChange: handlers.onStatusChange,
      tables: [
        {
          table: 'meals',
          filter: `family_id=eq.${scope.familyId}`,
          onInsert: (row) => handlers.onMealChange({ action: 'insert', record: mapMeal(row) }),
          onUpdate: (row) => handlers.onMealChange({ action: 'update', record: mapMeal(row) }),
          onDelete: (row) => handlers.onMealChange({ action: 'delete', id: String(row.id) }),
        },
        {
          table: 'meal_plan_entries',
          filter: `family_id=eq.${scope.familyId}`,
          onInsert: (row) => handlers.onPlanEntryChange({ action: 'insert', record: mapMealPlanEntry(row) }),
          onUpdate: (row) => handlers.onPlanEntryChange({ action: 'update', record: mapMealPlanEntry(row) }),
          onDelete: (row) => handlers.onPlanEntryChange({ action: 'delete', id: String(row.id) }),
        },
        {
          table: 'meal_vote_rounds',
          filter: `family_id=eq.${scope.familyId}`,
          onInsert: (row) => handlers.onVoteRoundChange(String(row.id)),
          onUpdate: (row) => handlers.onVoteRoundChange(String(row.id)),
          onDelete: (row) => handlers.onVoteRoundChange(String(row.id)),
        },
        {
          // meal_vote_candidates and meal_votes carry no family_id (they are
          // scoped through round_id / candidate_id), so there is no filter to
          // apply here; RLS still limits delivery to this family's rounds.
          table: 'meal_vote_candidates',
          onInsert: (row) => handlers.onVoteRoundChange(String(row.round_id)),
          onUpdate: (row) => handlers.onVoteRoundChange(String(row.round_id)),
          onDelete: (row) => handlers.onVoteRoundChange(String(row.round_id)),
        },
        {
          table: 'meal_votes',
          // A vote names its candidate, not its round; the provider resolves
          // the owning round from the candidate it already holds.
          onInsert: (row) => handlers.onVoteRoundChange(`candidate:${String(row.candidate_id)}`),
          onUpdate: (row) => handlers.onVoteRoundChange(`candidate:${String(row.candidate_id)}`),
          onDelete: (row) => handlers.onVoteRoundChange(`candidate:${String(row.candidate_id)}`),
        },
      ],
    })
  }
}

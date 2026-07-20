import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { useMeals, type Meal, type MealCategory, type MealStatus } from '../../hooks/useMeals'
import { useMealVoteRounds, type MealVote, type MealVoteCandidate, type MealVoteRound, type VoteValue } from '../../hooks/useMealVoteRounds'
import {
  useMealPlanEntries,
  type MealPlanEntry,
  type MealPlanOrigin,
  type MealPlanStatus,
  type MealSlot,
} from '../../hooks/useMealPlanEntries'
import { getWeekDates } from '../../utils/mealWeek'
import { buildCopiedEntries } from '../../utils/mealPlanGrouping'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

export interface MealInput {
  name: string
  description: string
  category: MealCategory
  tags: string[]
  prepMinutes: number | null
  notes: string
  sourceUrl: string
  status: MealStatus
}

function mealInputToRow(input: MealInput) {
  return {
    name: input.name,
    description: input.description || null,
    category: input.category,
    tags: input.tags,
    prep_minutes: input.prepMinutes,
    notes: input.notes || null,
    source_url: input.sourceUrl || null,
    status: input.status,
  }
}

export interface VoteRoundInput {
  title: string
  description: string
  deadlineAt: string | null
  mealIds: string[]
}

export interface PlanEntryInput {
  entryDate: string
  mealSlot: MealSlot
  mealId: string | null
  title: string
  responsibleMemberId: string | null
  notes: string
  status: MealPlanStatus
  origin: MealPlanOrigin
  sourceEntryId: string | null
}

function planEntryInputToRow(input: PlanEntryInput) {
  return {
    entry_date: input.entryDate,
    meal_slot: input.mealSlot,
    meal_id: input.mealId,
    title: input.title || null,
    responsible_member_id: input.responsibleMemberId,
    notes: input.notes || null,
    status: input.status,
    origin: input.origin,
    source_entry_id: input.sourceEntryId,
  }
}

// meal_vote_rounds is fetched as one query nested down to candidates->votes
// (useMealVoteRounds.ts). Realtime fires per-table, not per-nested-shape, so
// a change to a candidate or a vote has to be located within its owning
// round (by round_id) or candidate (by candidate_id) and patched in place —
// this nesting logic is domain-specific and stays local to meals, same as
// shopping's reorder logic stays in shoppingMutationQueue.ts.
function voteRoundFromRow(row: Record<string, unknown>, candidates: MealVoteCandidate[]): MealVoteRound {
  return { ...row, candidates } as unknown as MealVoteRound
}

function applyVoteRoundChange(rounds: MealVoteRound[], row: Record<string, unknown>, action: 'insert' | 'update' | 'delete'): MealVoteRound[] {
  if (action === 'delete') return applyRealtimeDelete(rounds, row.id as string)
  const existing = rounds.find((round) => round.id === row.id)
  const round = voteRoundFromRow(row, existing?.candidates ?? [])
  return action === 'insert' ? applyRealtimeInsert(rounds, round) : applyRealtimeUpdate(rounds, round)
}

function candidateFromRow(row: Record<string, unknown>, votes: MealVote[]): MealVoteCandidate {
  return { ...row, votes } as unknown as MealVoteCandidate
}

function applyCandidateChange(rounds: MealVoteRound[], row: Record<string, unknown>, action: 'insert' | 'update' | 'delete'): MealVoteRound[] {
  const roundId = row.round_id as string
  const candidateId = row.id as string
  return rounds.map((round) => {
    if (round.id !== roundId) return round
    if (action === 'delete') return { ...round, candidates: applyRealtimeDelete(round.candidates, candidateId) }
    const existing = round.candidates.find((candidate) => candidate.id === candidateId)
    const candidate = candidateFromRow(row, existing?.votes ?? [])
    const candidates = action === 'insert'
      ? applyRealtimeInsert(round.candidates, candidate)
      : applyRealtimeUpdate(round.candidates, candidate)
    return { ...round, candidates }
  })
}

function applyVoteChange(rounds: MealVoteRound[], row: Record<string, unknown>, action: 'insert' | 'update' | 'delete'): MealVoteRound[] {
  const candidateId = row.candidate_id as string
  const voteId = row.id as string
  return rounds.map((round) => {
    const candidateIndex = round.candidates.findIndex((candidate) => candidate.id === candidateId)
    if (candidateIndex === -1) return round
    const candidate = round.candidates[candidateIndex]
    const nextVotes = action === 'delete'
      ? applyRealtimeDelete(candidate.votes, voteId)
      : action === 'insert'
        ? applyRealtimeInsert(candidate.votes, row as unknown as MealVote)
        : applyRealtimeUpdate(candidate.votes, row as unknown as MealVote)
    if (nextVotes === candidate.votes) return round
    const nextCandidates = [...round.candidates]
    nextCandidates[candidateIndex] = { ...candidate, votes: nextVotes }
    return { ...round, candidates: nextCandidates }
  })
}

// Composes the meals/voting/plan hooks and every meal-related mutation into
// one object for MealsContext to wrap. Named "Source" (not "Data") to avoid
// any ambiguity with the MealsContext accessor hook, useMealsDataContext().
export function useMealsDataSource(familyId: string | undefined, userId: string) {
  const { meals, setMeals, loading: mealsLoading, error: mealsError, refresh: refreshMeals } = useMeals(familyId)
  const {
    voteRounds,
    setVoteRounds,
    loading: voteRoundsLoading,
    error: voteRoundsError,
    refresh: refreshVoteRounds,
  } = useMealVoteRounds(familyId)
  const {
    planEntries,
    setPlanEntries,
    loading: planEntriesLoading,
    error: planEntriesError,
    refresh: refreshPlanEntries,
  } = useMealPlanEntries(familyId)
  const [mealsRealtimeStatus, setMealsRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:meals`,
      owner: 'MealsProvider',
      openReason: 'provider-mount',
      onStatusChange: setMealsRealtimeStatus,
      tables: [
        {
          table: 'meals',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => setMeals((current) => applyRealtimeInsert(current, row as unknown as Meal)),
          onUpdate: (row) => setMeals((current) => applyRealtimeUpdate(current, row as unknown as Meal)),
          onDelete: (row) => setMeals((current) => applyRealtimeDelete(current, row.id as string)),
        },
        {
          table: 'meal_plan_entries',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => setPlanEntries((current) => applyRealtimeInsert(current, row as unknown as MealPlanEntry)),
          onUpdate: (row) => setPlanEntries((current) => applyRealtimeUpdate(current, row as unknown as MealPlanEntry)),
          onDelete: (row) => setPlanEntries((current) => applyRealtimeDelete(current, row.id as string)),
        },
        {
          table: 'meal_vote_rounds',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => setVoteRounds((current) => applyVoteRoundChange(current, row, 'insert')),
          onUpdate: (row) => setVoteRounds((current) => applyVoteRoundChange(current, row, 'update')),
          onDelete: (row) => setVoteRounds((current) => applyVoteRoundChange(current, row, 'delete')),
        },
        {
          // meal_vote_candidates/meal_votes have no family_id column (scoped
          // via round_id/candidate_id) — no `filter`, RLS still limits
          // delivery to this family's vote rounds.
          table: 'meal_vote_candidates',
          onInsert: (row) => setVoteRounds((current) => applyCandidateChange(current, row, 'insert')),
          onUpdate: (row) => setVoteRounds((current) => applyCandidateChange(current, row, 'update')),
          onDelete: (row) => setVoteRounds((current) => applyCandidateChange(current, row, 'delete')),
        },
        {
          table: 'meal_votes',
          onInsert: (row) => setVoteRounds((current) => applyVoteChange(current, row, 'insert')),
          onUpdate: (row) => setVoteRounds((current) => applyVoteChange(current, row, 'update')),
          onDelete: (row) => setVoteRounds((current) => applyVoteChange(current, row, 'delete')),
        },
      ],
    })
    return unsubscribe
  }, [familyId, setMeals, setPlanEntries, setVoteRounds])

  const loading = mealsLoading || voteRoundsLoading || planEntriesLoading
  const error = mealsError || voteRoundsError || planEntriesError

  const refreshMealsData = useCallback(async () => {
    await Promise.all([refreshMeals(), refreshVoteRounds(), refreshPlanEntries()])
  }, [refreshMeals, refreshVoteRounds, refreshPlanEntries])

  const addMeal = useCallback(
    async (input: MealInput) => {
      const { error } = await supabase.from('meals').insert({ family_id: familyId, created_by: userId, ...mealInputToRow(input) })
      if (error) throw friendly(error)
      await refreshMeals()
    },
    [familyId, userId, refreshMeals]
  )

  const updateMeal = useCallback(
    async (id: string, input: MealInput) => {
      const { error } = await supabase
        .from('meals')
        .update({ ...mealInputToRow(input), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw friendly(error)
      await refreshMeals()
    },
    [refreshMeals]
  )

  // Creates a round (draft) with the given candidates, then optionally
  // opens it immediately — the two-button "create draft" vs. "start
  // voting" choice in the UI maps to whether `openImmediately` is true.
  const createVoteRound = useCallback(
    async (input: VoteRoundInput, openImmediately: boolean): Promise<string> => {
      const { data: round, error } = await supabase
        .from('meal_vote_rounds')
        .insert({
          family_id: familyId,
          created_by: userId,
          title: input.title,
          description: input.description || null,
          deadline_at: input.deadlineAt,
        })
        .select('id')
        .single()
      if (error) throw friendly(error)

      if (input.mealIds.length > 0) {
        const mealById = new Map(meals.map((meal) => [meal.id, meal]))
        const candidateRows = input.mealIds.map((mealId) => ({
          round_id: round.id,
          meal_id: mealId,
          meal_title: mealById.get(mealId)?.name ?? '',
        }))
        const { error: candidateError } = await supabase.from('meal_vote_candidates').insert(candidateRows)
        if (candidateError) throw friendly(candidateError)
      }

      if (openImmediately) {
        const { error: openError } = await supabase.rpc('open_vote_round', { round_id: round.id })
        if (openError) throw friendly(openError)
      }

      await refreshVoteRounds()
      return round.id as string
    },
    [familyId, userId, meals, refreshVoteRounds]
  )

  const addCandidatesToRound = useCallback(
    async (roundId: string, mealIds: string[]) => {
      const mealById = new Map(meals.map((meal) => [meal.id, meal]))
      const candidateRows = mealIds.map((mealId) => ({
        round_id: roundId,
        meal_id: mealId,
        meal_title: mealById.get(mealId)?.name ?? '',
      }))
      const { error } = await supabase.from('meal_vote_candidates').insert(candidateRows)
      if (error) throw friendly(error)
      await refreshVoteRounds()
    },
    [meals, refreshVoteRounds]
  )

  const openRound = useCallback(
    async (roundId: string) => {
      const { error } = await supabase.rpc('open_vote_round', { round_id: roundId })
      if (error) throw friendly(error)
      await refreshVoteRounds()
    },
    [refreshVoteRounds]
  )

  const closeRound = useCallback(
    async (roundId: string) => {
      const { error } = await supabase.rpc('close_vote_round', { round_id: roundId })
      if (error) throw friendly(error)
      await refreshVoteRounds()
    },
    [refreshVoteRounds]
  )

  const castVote = useCallback(
    async (candidateId: string, memberId: string, value: VoteValue) => {
      const { error } = await supabase
        .from('meal_votes')
        .upsert(
          { candidate_id: candidateId, member_id: memberId, value, created_by: userId, updated_at: new Date().toISOString() },
          { onConflict: 'candidate_id,member_id' }
        )
      if (error) throw friendly(error)
      await refreshVoteRounds()
    },
    [userId, refreshVoteRounds]
  )

  const addPlanEntry = useCallback(
    async (input: PlanEntryInput) => {
      const { error } = await supabase
        .from('meal_plan_entries')
        .insert({ family_id: familyId, created_by: userId, ...planEntryInputToRow(input) })
      if (error) throw friendly(error)
      await refreshPlanEntries()
    },
    [familyId, userId, refreshPlanEntries]
  )

  const updatePlanEntry = useCallback(
    async (id: string, input: PlanEntryInput) => {
      const { error } = await supabase
        .from('meal_plan_entries')
        .update({ ...planEntryInputToRow(input), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw friendly(error)
      await refreshPlanEntries()
    },
    [refreshPlanEntries]
  )

  const deletePlanEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id)
      if (error) throw friendly(error)
      await refreshPlanEntries()
    },
    [refreshPlanEntries]
  )

  const copyWeek = useCallback(
    async (fromWeekStart: string, toWeekStart: string) => {
      const fromDates = new Set(getWeekDates(fromWeekStart))
      const entriesToCopy = planEntries.filter((entry) => fromDates.has(entry.entry_date))
      if (entriesToCopy.length === 0) return

      const copied = buildCopiedEntries(entriesToCopy, fromWeekStart, toWeekStart)
      const rows = copied.map((entry) => ({
        family_id: familyId,
        created_by: userId,
        entry_date: entry.entry_date,
        meal_slot: entry.meal_slot,
        meal_id: entry.meal_id,
        title: entry.title,
        responsible_member_id: entry.responsible_member_id,
        notes: entry.notes,
        status: 'proposed',
        origin: 'copied',
      }))
      const { error } = await supabase.from('meal_plan_entries').insert(rows)
      if (error) throw friendly(error)
      await refreshPlanEntries()
    },
    [familyId, userId, planEntries, refreshPlanEntries]
  )

  return {
    meals,
    voteRounds,
    planEntries,
    planEntriesLoading,
    planEntriesError,
    loading,
    error,
    mealsRealtimeStatus,
    refreshMealsData,
    addMeal,
    updateMeal,
    createVoteRound,
    addCandidatesToRound,
    openRound,
    closeRound,
    castVote,
    addPlanEntry,
    updatePlanEntry,
    deletePlanEntry,
    copyWeek,
  }
}

export type { Meal, MealPlanEntry }

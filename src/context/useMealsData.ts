import { useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { useMeals, type Meal, type MealCategory, type MealStatus } from '../hooks/useMeals'
import { useMealVoteRounds, type VoteValue } from '../hooks/useMealVoteRounds'
import {
  useMealPlanEntries,
  type MealPlanEntry,
  type MealPlanOrigin,
  type MealPlanStatus,
  type MealSlot,
} from '../hooks/useMealPlanEntries'
import { getWeekDates } from '../utils/mealWeek'
import { buildCopiedEntries } from '../utils/mealPlanGrouping'

// Supabase errors aren't meant for end users (raw constraint names,
// English text) — log the real one for debugging, surface a generic
// localized string. Same helper shape as FamilyDataContext's `friendly`.
function friendly(error: { message: string }): Error {
  console.error(error.message)
  return new Error(t.errors.generic)
}

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

// Composes the meals/voting/plan hooks and every meal-related mutation
// into one object. Kept separate from FamilyDataContext.tsx (which just
// calls this hook and spreads the result into its own value) purely to
// stop that file from growing into an unmaintainable single file — this
// is not a second data boundary, `useFamilyData()` remains the one place
// components read from.
export function useMealsData(familyId: string | undefined, userId: string) {
  const { meals, loading: mealsLoading, error: mealsError, refresh: refreshMeals } = useMeals(familyId)
  const {
    voteRounds,
    loading: voteRoundsLoading,
    error: voteRoundsError,
    refresh: refreshVoteRounds,
  } = useMealVoteRounds(familyId)
  const {
    planEntries,
    loading: planEntriesLoading,
    error: planEntriesError,
    refresh: refreshPlanEntries,
  } = useMealPlanEntries(familyId)

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
    loading,
    error,
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

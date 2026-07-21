import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SupabaseMealsRepository } from '../../features/meals/data/supabaseMealsRepository'
import type { MealsRepository, RealtimeChange } from '../../features/meals/data/mealsRepository'
import { getWeekDates } from '../../utils/mealWeek'
import { buildCopiedEntries } from '../../utils/mealPlanGrouping'
import type { RealtimeConnectionState } from '../../realtime/connectionState'
import { t } from '../../strings'
import type {
  Meal,
  MealInput,
  MealPlanEntry,
  MealVoteRound,
  PlanEntryInput,
  VoteRoundInput,
  VoteValue,
} from '../../features/meals/domain/mealTypes'

/** Insert-or-replace by id, preserving list order for updates. */
function upsertById<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((entry) => entry.id === record.id)
  if (index === -1) return [...list, record]
  const next = [...list]
  next[index] = record
  return next
}

function applyChange<T extends { id: string }>(list: T[], change: RealtimeChange<T>): T[] {
  if (change.action === 'delete') return list.filter((entry) => entry.id !== change.id)
  return upsertById(list, change.record)
}

export function normalizeMealNameForMatch(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function mealCategoryFromSlot(slot: PlanEntryInput['mealSlot']): MealInput['category'] {
  if (slot === 'breakfast' || slot === 'lunch' || slot === 'dinner' || slot === 'snack') return slot
  return 'other'
}

function mealInputFromPlanEntry(input: PlanEntryInput): MealInput {
  return {
    name: input.title.trim(),
    description: '',
    category: mealCategoryFromSlot(input.mealSlot),
    tags: [],
    prepMinutes: null,
    notes: input.notes,
    sourceUrl: '',
    status: 'active',
  }
}

/**
 * Thin composition over the meals repository: view state, domain calls, and
 * merging results back in. No queries, no row mapping, no error parsing.
 *
 * The old version reloaded the entire meals domain after every mutation
 * (`Promise.all([refreshMeals, refreshVoteRounds, refreshPlanEntries])`).
 * Mutations now return the affected aggregate and it is merged in place, so
 * adding one meal no longer refetches the plan and every vote round.
 */
export function useMealsDataSource(familyId: string | undefined, userId: string, repositoryOverride?: MealsRepository) {
  const repository = useMemo(() => repositoryOverride ?? new SupabaseMealsRepository(), [repositoryOverride])
  const scope = useMemo(() => familyId ? { familyId, userId } : null, [familyId, userId])

  const [meals, setMeals] = useState<Meal[]>([])
  const [planEntries, setPlanEntries] = useState<MealPlanEntry[]>([])
  const [voteRounds, setVoteRounds] = useState<MealVoteRound[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mealsRealtimeStatus, setMealsRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  // Realtime for a vote round arrives per-table; resolving which round a
  // candidate or vote belongs to needs the rounds we are already holding.
  const voteRoundsRef = useRef<MealVoteRound[]>([])
  voteRoundsRef.current = voteRounds

  const refreshMealsData = useCallback(async () => {
    if (!scope) {
      setMeals([]); setPlanEntries([]); setVoteRounds([]); setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [library, plan, rounds] = await Promise.all([
        repository.listMealLibrary(scope),
        repository.listPlanEntries(scope),
        repository.listVoteRounds(scope),
      ])
      setMeals(library); setPlanEntries(plan); setVoteRounds(rounds)
      setError(null)
    } catch (loadError) {
      console.error('Failed to load meals:', loadError instanceof Error ? loadError.message : 'unknown error')
      setMeals([]); setPlanEntries([]); setVoteRounds([])
      setError(t.errors.loadFailed)
    }
    setLoading(false)
  }, [repository, scope])

  useEffect(() => { void refreshMealsData() }, [refreshMealsData])

  const reloadRound = useCallback(async (roundId: string) => {
    if (!scope) return
    // A round changed remotely. Re-reading only that round keeps the nested
    // candidate/vote shape correct without refetching every round.
    const rounds = await repository.listVoteRounds(scope).catch(() => null)
    if (rounds) setVoteRounds(rounds)
    void roundId
  }, [repository, scope])

  useEffect(() => {
    if (!scope) return
    return repository.subscribe(scope, {
      onStatusChange: (status) => setMealsRealtimeStatus(status as RealtimeConnectionState),
      onMealChange: (change) => setMeals((current) => applyChange(current, change)),
      onPlanEntryChange: (change) => setPlanEntries((current) => applyChange(current, change)),
      onVoteRoundChange: (token) => {
        if (!token.startsWith('candidate:')) { void reloadRound(token); return }
        const candidateId = token.slice('candidate:'.length)
        const owning = voteRoundsRef.current.find((round) => round.candidates.some((candidate) => candidate.id === candidateId))
        if (owning) void reloadRound(owning.id)
      },
    })
  }, [repository, scope, reloadRound])

  const addMeal = useCallback(async (input: MealInput) => {
    if (!scope) return
    const created = await repository.createMeal(scope, input)
    setMeals((current) => upsertById(current, created))
  }, [repository, scope])

  const updateMeal = useCallback(async (id: string, input: MealInput) => {
    const updated = await repository.updateMealDetails(id, input)
    setMeals((current) => upsertById(current, updated))
  }, [repository])

  const resolveCandidates = useCallback((mealIds: string[]) => {
    const byId = new Map(meals.map((meal) => [meal.id, meal]))
    return mealIds.map((mealId) => ({ mealId, mealTitle: byId.get(mealId)?.name ?? '' }))
  }, [meals])

  const createVoteRound = useCallback(async (input: VoteRoundInput, openImmediately: boolean): Promise<string> => {
    if (!scope) throw new Error('Meals repository is not ready')
    const { mealIds, ...draft } = input
    const round = await repository.createVoteRound(scope, draft, resolveCandidates(mealIds), openImmediately)
    setVoteRounds((current) => [round, ...current.filter((entry) => entry.id !== round.id)])
    return round.id
  }, [repository, resolveCandidates, scope])

  const addCandidatesToRound = useCallback(async (roundId: string, mealIds: string[]) => {
    const round = await repository.addCandidates(roundId, resolveCandidates(mealIds))
    setVoteRounds((current) => upsertById(current, round))
  }, [repository, resolveCandidates])

  const openRound = useCallback(async (roundId: string) => {
    const round = await repository.openVoteRound(roundId)
    setVoteRounds((current) => upsertById(current, round))
  }, [repository])

  const closeRound = useCallback(async (roundId: string) => {
    const round = await repository.closeVoteRound(roundId)
    setVoteRounds((current) => upsertById(current, round))
  }, [repository])

  const castVote = useCallback(async (candidateId: string, memberId: string, value: VoteValue) => {
    if (!scope) return
    const owning = voteRoundsRef.current.find((entry) => entry.candidates.some((candidate) => candidate.id === candidateId))
    if (!owning) throw new Error('Vote candidate does not belong to a loaded round')
    const round = await repository.recordVote(scope, owning.id, candidateId, memberId, value)
    setVoteRounds((current) => upsertById(current, round))
  }, [repository, scope])

  const addPlanEntry = useCallback(async (input: PlanEntryInput) => {
    if (!scope) return
    let planInput = input
    if (input.saveToLibrary && !input.mealId && input.title.trim()) {
      const normalizedTitle = normalizeMealNameForMatch(input.title)
      const existing = meals.find((meal) => normalizeMealNameForMatch(meal.name) === normalizedTitle)
      const libraryMeal = existing ?? await repository.createMeal(scope, mealInputFromPlanEntry(input))
      if (!existing) setMeals((current) => upsertById(current, libraryMeal))
      planInput = { ...input, mealId: libraryMeal.id, title: libraryMeal.name }
    }
    const entry = await repository.planMeal(scope, planInput)
    setPlanEntries((current) => upsertById(current, entry))
  }, [meals, repository, scope])

  const updatePlanEntry = useCallback(async (id: string, input: PlanEntryInput) => {
    const entry = await repository.reschedulePlanEntry(id, input)
    setPlanEntries((current) => upsertById(current, entry))
  }, [repository])

  const deletePlanEntry = useCallback(async (id: string) => {
    await repository.removePlanEntry(id)
    setPlanEntries((current) => current.filter((entry) => entry.id !== id))
  }, [repository])

  const copyWeek = useCallback(async (fromWeekStart: string, toWeekStart: string) => {
    if (!scope) return
    const fromDates = new Set(getWeekDates(fromWeekStart))
    const entriesToCopy = planEntries.filter((entry) => fromDates.has(entry.entry_date))
    if (entriesToCopy.length === 0) return
    const created = await repository.copyPlanWeek(scope, buildCopiedEntries(entriesToCopy, fromWeekStart, toWeekStart))
    setPlanEntries((current) => created.reduce(upsertById, current))
  }, [planEntries, repository, scope])

  return {
    meals,
    voteRounds,
    planEntries,
    planEntriesLoading: loading,
    planEntriesError: error,
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

export type { Meal, MealPlanEntry, MealInput, PlanEntryInput, VoteRoundInput }

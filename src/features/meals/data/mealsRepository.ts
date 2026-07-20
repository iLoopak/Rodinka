import type {
  FamilyScope,
  Meal,
  MealInput,
  MealPlanEntry,
  MealVoteRound,
  PlanEntryInput,
  VoteRoundInput,
  VoteValue,
} from '../domain/mealTypes'
import type { CopyableEntryInput } from '../../../utils/mealPlanGrouping'

export type VoteRoundDraft = Omit<VoteRoundInput, 'mealIds'>
export interface MealCandidateDraft { mealId: string; mealTitle: string }

/**
 * Domain operations, named after what the UI actually does. Deliberately not
 * `create(table, row)` — a generic CRUD surface would let the next caller put
 * a query shape back into a component, which is the debt this replaces.
 *
 * Every mutation returns the affected aggregate so the caller can merge it in
 * place instead of refetching the whole domain.
 */
export interface MealsRepository {
  listMealLibrary(scope: FamilyScope): Promise<Meal[]>
  createMeal(scope: FamilyScope, input: MealInput): Promise<Meal>
  updateMealDetails(id: string, input: MealInput): Promise<Meal>

  listPlanEntries(scope: FamilyScope): Promise<MealPlanEntry[]>
  planMeal(scope: FamilyScope, input: PlanEntryInput): Promise<MealPlanEntry>
  reschedulePlanEntry(id: string, input: PlanEntryInput): Promise<MealPlanEntry>
  removePlanEntry(id: string): Promise<void>
  /** Takes the already-offset payloads from `buildCopiedEntries`, not full entries. */
  copyPlanWeek(scope: FamilyScope, entries: CopyableEntryInput[]): Promise<MealPlanEntry[]>

  listVoteRounds(scope: FamilyScope): Promise<MealVoteRound[]>
  /**
   * Creates the round plus its candidates, and opens it when asked.
   * Candidates arrive with their titles already resolved: looking a meal name
   * up from the library is the caller's job, not a reason for the repository
   * to know about UI state.
   */
  createVoteRound(scope: FamilyScope, draft: VoteRoundDraft, candidates: MealCandidateDraft[], openImmediately: boolean): Promise<MealVoteRound>
  addCandidates(roundId: string, candidates: MealCandidateDraft[]): Promise<MealVoteRound>
  openVoteRound(roundId: string): Promise<MealVoteRound>
  closeVoteRound(roundId: string): Promise<MealVoteRound>
  /** roundId is passed in because the caller already holds the round. */
  recordVote(scope: FamilyScope, roundId: string, candidateId: string, memberId: string, value: VoteValue): Promise<MealVoteRound>

  subscribe(scope: FamilyScope, handlers: MealsRealtimeHandlers): () => void
}

/**
 * Realtime is owned here rather than in the provider, so there is exactly one
 * meals channel and the nested vote-round patching lives next to the mappers
 * that produce the same shapes.
 */
export interface MealsRealtimeHandlers {
  onMealChange: (change: RealtimeChange<Meal>) => void
  onPlanEntryChange: (change: RealtimeChange<MealPlanEntry>) => void
  /** Rounds, candidates and votes all resolve to "this round changed". */
  onVoteRoundChange: (roundId: string) => void
  onStatusChange: (status: string) => void
}

export type RealtimeChange<T> =
  | { action: 'insert' | 'update'; record: T }
  | { action: 'delete'; id: string }

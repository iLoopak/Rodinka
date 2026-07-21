/**
 * Meals domain types.
 *
 * These used to live inside the fetch hooks (`hooks/useMeals.ts` and friends),
 * which meant the shape of the domain was defined by whatever the loader
 * happened to select. They belong to the domain, so the repository and the UI
 * agree on one definition.
 *
 * Field names still mirror the Postgres columns. Renaming them to camelCase is
 * a worthwhile change but not this one: `MealPlanEntry` is embedded in the
 * persisted calendar snapshot and read by six utility modules, the today
 * agenda and the reminder sources, so the rename is a cross-domain refactor
 * rather than part of taking ownership of the meals queries. Tracked as P2-M2
 * in the data layer audit.
 */

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert' | 'other'
export type MealStatus = 'active' | 'archived'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other'
export type MealPlanStatus = 'proposed' | 'confirmed' | 'completed' | 'skipped'
export type MealPlanOrigin = 'manual' | 'vote' | 'copied'
export type VoteRoundStatus = 'draft' | 'open' | 'closed'
export type VoteValue = -1 | 0 | 1

export interface Meal {
  id: string
  family_id: string
  name: string
  description: string | null
  category: MealCategory
  tags: string[]
  prep_minutes: number | null
  notes: string | null
  source_url: string | null
  status: MealStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface MealPlanEntry {
  id: string
  family_id: string
  entry_date: string
  meal_slot: MealSlot
  meal_id: string | null
  title: string | null
  responsible_member_id: string | null
  notes: string | null
  status: MealPlanStatus
  origin: MealPlanOrigin
  source_entry_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface MealVote {
  id: string
  candidate_id: string
  member_id: string
  value: VoteValue
  created_by: string
  created_at: string
  updated_at: string
}

export interface MealVoteCandidate {
  id: string
  round_id: string
  meal_id: string | null
  meal_title: string
  created_at: string
  votes: MealVote[]
}

export interface MealVoteRound {
  id: string
  family_id: string
  title: string
  description: string | null
  status: VoteRoundStatus
  deadline_at: string | null
  created_by: string
  created_at: string
  closed_at: string | null
  candidates: MealVoteCandidate[]
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
  saveToLibrary?: boolean
}

export interface VoteRoundInput {
  title: string
  description: string
  deadlineAt: string | null
  mealIds: string[]
}

export interface FamilyScope {
  familyId: string
  userId: string
}

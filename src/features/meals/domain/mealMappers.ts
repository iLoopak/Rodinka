import type {
  Meal,
  MealInput,
  MealPlanEntry,
  MealVote,
  MealVoteCandidate,
  MealVoteRound,
  PlanEntryInput,
} from './mealTypes'

/**
 * One definition of what each meals aggregate is made of, and one place that
 * turns a Postgres row into it.
 *
 * The column lists matter as much as the mappers: `meal_plan_entries` was
 * selected in two places with two hand-maintained lists (the meals loader and
 * the calendar snapshot). They agreed by luck, not by construction, and the
 * day they stopped agreeing the calendar and the meal planner would have shown
 * different data for the same entry. Audit finding P1-M1.
 */

export const MEAL_COLUMNS =
  'id, family_id, name, description, category, tags, prep_minutes, notes, source_url, status, created_by, created_at, updated_at'

export const MEAL_PLAN_ENTRY_COLUMNS =
  'id, family_id, entry_date, meal_slot, meal_id, title, responsible_member_id, notes, status, origin, source_entry_id, created_by, created_at, updated_at'

export const MEAL_VOTE_COLUMNS =
  'id, candidate_id, member_id, value, created_by, created_at, updated_at'

export const MEAL_VOTE_CANDIDATE_COLUMNS =
  `id, round_id, meal_id, meal_title, created_at, votes:meal_votes(${MEAL_VOTE_COLUMNS})`

export const MEAL_VOTE_ROUND_COLUMNS =
  `id, family_id, title, description, status, deadline_at, created_by, created_at, closed_at, candidates:meal_vote_candidates(${MEAL_VOTE_CANDIDATE_COLUMNS})`

type Row = Record<string, unknown>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const nullableText = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null

/** Postgres `numeric` and `integer` both arrive as strings often enough to matter. */
const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

export function mapMeal(row: Row): Meal {
  return {
    id: text(row.id),
    family_id: text(row.family_id),
    name: text(row.name),
    description: nullableText(row.description),
    category: (row.category ?? 'other') as Meal['category'],
    // A meal with no tags comes back as null from some inserts and as [] from
    // others; the UI only ever wants a list.
    tags: stringList(row.tags),
    prep_minutes: nullableNumber(row.prep_minutes),
    notes: nullableText(row.notes),
    source_url: nullableText(row.source_url),
    status: (row.status ?? 'active') as Meal['status'],
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  }
}

export function mapMealPlanEntry(row: Row): MealPlanEntry {
  return {
    id: text(row.id),
    family_id: text(row.family_id),
    entry_date: text(row.entry_date),
    meal_slot: (row.meal_slot ?? 'other') as MealPlanEntry['meal_slot'],
    meal_id: nullableText(row.meal_id),
    title: nullableText(row.title),
    responsible_member_id: nullableText(row.responsible_member_id),
    notes: nullableText(row.notes),
    status: (row.status ?? 'proposed') as MealPlanEntry['status'],
    origin: (row.origin ?? 'manual') as MealPlanEntry['origin'],
    source_entry_id: nullableText(row.source_entry_id),
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  }
}

export function mapMealVote(row: Row): MealVote {
  const raw = nullableNumber(row.value) ?? 0
  return {
    id: text(row.id),
    candidate_id: text(row.candidate_id),
    member_id: text(row.member_id),
    // Anything outside the ballot is treated as abstain rather than trusted.
    value: (raw === 1 || raw === -1 ? raw : 0) as MealVote['value'],
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  }
}

export function mapMealVoteCandidate(row: Row, votes?: MealVote[]): MealVoteCandidate {
  return {
    id: text(row.id),
    round_id: text(row.round_id),
    meal_id: nullableText(row.meal_id),
    meal_title: text(row.meal_title),
    created_at: text(row.created_at),
    votes: votes ?? (Array.isArray(row.votes) ? (row.votes as Row[]).map(mapMealVote) : []),
  }
}

export function mapMealVoteRound(row: Row, candidates?: MealVoteCandidate[]): MealVoteRound {
  return {
    id: text(row.id),
    family_id: text(row.family_id),
    title: text(row.title),
    description: nullableText(row.description),
    status: (row.status ?? 'draft') as MealVoteRound['status'],
    deadline_at: nullableText(row.deadline_at),
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    closed_at: nullableText(row.closed_at),
    candidates: candidates
      ?? (Array.isArray(row.candidates) ? (row.candidates as Row[]).map((candidate) => mapMealVoteCandidate(candidate)) : []),
  }
}

export function mealInputToRow(input: MealInput) {
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

export function planEntryInputToRow(input: PlanEntryInput) {
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

import type { Meal } from '../hooks/useMeals'
import type { MealPlanEntry } from '../hooks/useMealPlanEntries'
import type { MealVoteRound } from '../hooks/useMealVoteRounds'
import { addDays, compareISODates } from './dueDate'
import { tallyVotes } from './mealVoting'

// All suggestion logic here is deterministic and derived only from
// existing family data (plan history + vote history) — no external
// service, no AI, nothing that would change between renders for the
// same inputs.

export function activeMeals(meals: Meal[]): Meal[] {
  return meals.filter((meal) => meal.status === 'active')
}

// Active meals used in a plan entry (past or today) within the last
// `withinDays` days, most-recently-used first, de-duplicated.
export function recentlyUsedMeals(
  meals: Meal[],
  planEntries: MealPlanEntry[],
  today: string,
  withinDays = 14
): Meal[] {
  const cutoff = addDays(today, -withinDays)
  const mealById = new Map(meals.map((meal) => [meal.id, meal]))

  const sortedEntries = [...planEntries].sort((a, b) => compareISODates(b.entry_date, a.entry_date))

  const seen = new Set<string>()
  const ordered: Meal[] = []
  for (const entry of sortedEntries) {
    if (!entry.meal_id || seen.has(entry.meal_id)) continue
    if (compareISODates(entry.entry_date, cutoff) < 0) continue
    if (compareISODates(entry.entry_date, today) > 0) continue // only past/today use counts as "used"

    const meal = mealById.get(entry.meal_id)
    if (meal && meal.status === 'active') {
      seen.add(entry.meal_id)
      ordered.push(meal)
    }
  }
  return ordered
}

// Active meals that have NOT appeared in any plan entry (past, today, or
// already-planned future) within the last `withinDays` days — a nudge
// toward variety.
export function notPlannedRecently(
  meals: Meal[],
  planEntries: MealPlanEntry[],
  today: string,
  withinDays = 21
): Meal[] {
  const cutoff = addDays(today, -withinDays)
  const plannedRecentlyIds = new Set(
    planEntries.filter((entry) => entry.meal_id && compareISODates(entry.entry_date, cutoff) >= 0).map((entry) => entry.meal_id as string)
  )
  return activeMeals(meals).filter((meal) => !plannedRecentlyIds.has(meal.id))
}

export function quickMeals(meals: Meal[]): Meal[] {
  return activeMeals(meals).filter((meal) => meal.tags.some((tag) => tag.toLowerCase() === 'quick'))
}

// Active meals whose cumulative vote score (likes − dislikes, summed
// across every round they were a candidate in) is positive, ranked
// highest first with a stable alphabetical tie-break.
export function topVotedMeals(meals: Meal[], voteRounds: MealVoteRound[]): Meal[] {
  const scoreByMealId = new Map<string, number>()
  for (const round of voteRounds) {
    for (const candidate of round.candidates) {
      if (!candidate.meal_id) continue
      const score = tallyVotes(candidate.votes).score
      scoreByMealId.set(candidate.meal_id, (scoreByMealId.get(candidate.meal_id) ?? 0) + score)
    }
  }

  return activeMeals(meals)
    .filter((meal) => (scoreByMealId.get(meal.id) ?? 0) > 0)
    .sort((a, b) => {
      const scoreDiff = (scoreByMealId.get(b.id) ?? 0) - (scoreByMealId.get(a.id) ?? 0)
      return scoreDiff !== 0 ? scoreDiff : a.name.localeCompare(b.name)
    })
}

// Active meals a specific member has given at least one "like" vote to.
export function memberFavoriteMeals(meals: Meal[], voteRounds: MealVoteRound[], memberId: string): Meal[] {
  const likedMealIds = new Set<string>()
  for (const round of voteRounds) {
    for (const candidate of round.candidates) {
      if (!candidate.meal_id) continue
      if (candidate.votes.some((vote) => vote.member_id === memberId && vote.value === 1)) {
        likedMealIds.add(candidate.meal_id)
      }
    }
  }
  return activeMeals(meals).filter((meal) => likedMealIds.has(meal.id))
}

export type MealBadgeType = 'quick' | 'familyFavorite' | 'recentlyUsed' | 'notPlannedRecently'

export interface MealSuggestionContext {
  meals: Meal[]
  planEntries: MealPlanEntry[]
  voteRounds: MealVoteRound[]
  today: string
}

// Small set of at-a-glance badges for a single meal card — "recentlyUsed"
// and "notPlannedRecently" are mutually exclusive by construction.
export function getMealBadges(meal: Meal, ctx: MealSuggestionContext): MealBadgeType[] {
  const badges: MealBadgeType[] = []
  if (meal.tags.some((tag) => tag.toLowerCase() === 'quick')) badges.push('quick')
  if (topVotedMeals(ctx.meals, ctx.voteRounds).some((m) => m.id === meal.id)) badges.push('familyFavorite')

  if (recentlyUsedMeals(ctx.meals, ctx.planEntries, ctx.today).some((m) => m.id === meal.id)) {
    badges.push('recentlyUsed')
  } else if (notPlannedRecently(ctx.meals, ctx.planEntries, ctx.today).some((m) => m.id === meal.id)) {
    badges.push('notPlannedRecently')
  }
  return badges
}

import { t } from '../strings'
import type { MealCategory } from '../features/meals/domain/mealTypes'
import type { MealSlot, MealPlanStatus, MealPlanOrigin } from '../features/meals/domain/mealTypes'
import type { VoteRoundStatus } from '../features/meals/domain/mealTypes'
import type { MealBadgeType } from './mealSuggestions'

export const MEAL_CATEGORY_VALUES: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'other']

export function mealCategoryLabel(category: MealCategory): string {
  const labels: Record<MealCategory, string> = {
    breakfast: t.mealLibrary.categoryBreakfast,
    lunch: t.mealLibrary.categoryLunch,
    dinner: t.mealLibrary.categoryDinner,
    snack: t.mealLibrary.categorySnack,
    dessert: t.mealLibrary.categoryDessert,
    other: t.mealLibrary.categoryOther,
  }
  return labels[category]
}

// Suggested tag vocabulary — the meal form also allows free-form custom
// tags, so this is a menu of common ones, not an exhaustive enum.
export const SUGGESTED_MEAL_TAGS = [
  'quick',
  'weekend',
  'vegetarian',
  'kids_favorite',
  'freezer',
  'takeaway',
  'leftovers',
] as const

export function suggestedTagLabel(tag: string): string {
  const labels: Record<string, string> = {
    quick: t.mealLibrary.tagQuick,
    weekend: t.mealLibrary.tagWeekend,
    vegetarian: t.mealLibrary.tagVegetarian,
    kids_favorite: t.mealLibrary.tagKidsFavorite,
    freezer: t.mealLibrary.tagFreezer,
    takeaway: t.mealLibrary.tagTakeaway,
    leftovers: t.mealLibrary.tagLeftovers,
  }
  return labels[tag] ?? tag
}

export function mealBadgeLabel(badge: MealBadgeType): string {
  const labels: Record<MealBadgeType, string> = {
    quick: t.mealLibrary.badgeQuick,
    familyFavorite: t.mealLibrary.badgeFamilyFavorite,
    recentlyUsed: t.mealLibrary.badgeRecentlyUsed,
    notPlannedRecently: t.mealLibrary.badgeNotPlannedRecently,
  }
  return labels[badge]
}

export const MEAL_SLOT_VALUES: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other']

export function mealSlotLabel(slot: MealSlot): string {
  const labels: Record<MealSlot, string> = {
    breakfast: t.mealPlan.slotBreakfast,
    lunch: t.mealPlan.slotLunch,
    dinner: t.mealPlan.slotDinner,
    snack: t.mealPlan.slotSnack,
    other: t.mealPlan.slotOther,
  }
  return labels[slot]
}

export const MEAL_PLAN_STATUS_VALUES: MealPlanStatus[] = ['proposed', 'confirmed', 'completed', 'skipped']

export function mealPlanStatusLabel(status: MealPlanStatus): string {
  const labels: Record<MealPlanStatus, string> = {
    proposed: t.mealPlan.statusProposed,
    confirmed: t.mealPlan.statusConfirmed,
    completed: t.mealPlan.statusCompleted,
    skipped: t.mealPlan.statusSkipped,
  }
  return labels[status]
}

export function mealPlanOriginLabel(origin: MealPlanOrigin): string {
  const labels: Record<MealPlanOrigin, string> = {
    manual: t.mealPlan.originManual,
    vote: t.mealPlan.originVote,
    copied: t.mealPlan.originCopied,
  }
  return labels[origin]
}

export function voteRoundStatusLabel(status: VoteRoundStatus): string {
  const labels: Record<VoteRoundStatus, string> = {
    draft: t.mealVoting.draftBadge,
    open: t.mealVoting.openBadge,
    closed: t.mealVoting.closedBadge,
  }
  return labels[status]
}

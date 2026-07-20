import { describe, expect, it } from 'vitest'
import {
  activeMeals,
  getMealBadges,
  memberFavoriteMeals,
  notPlannedRecently,
  quickMeals,
  recentlyUsedMeals,
  topVotedMeals,
} from './mealSuggestions'
import { makeMeal, makeMealPlanEntry, makeMealVote, makeMealVoteCandidate } from './testFixtures'
import type { MealVoteRound } from '../features/meals/domain/mealTypes'

function makeRound(overrides: Partial<MealVoteRound> = {}): MealVoteRound {
  return {
    id: 'round-1',
    family_id: 'family-1',
    title: 'Round',
    description: null,
    status: 'closed',
    deadline_at: null,
    created_by: 'user-1',
    created_at: '2026-07-01T00:00:00Z',
    closed_at: '2026-07-02T00:00:00Z',
    candidates: [],
    ...overrides,
  }
}

const TODAY = '2026-07-13'

describe('activeMeals', () => {
  it('excludes archived meals', () => {
    const meals = [makeMeal({ id: 'a', status: 'active' }), makeMeal({ id: 'b', status: 'archived' })]
    expect(activeMeals(meals).map((m) => m.id)).toEqual(['a'])
  })
})

describe('recentlyUsedMeals', () => {
  it('lists active meals used in the last N days, most recent first, deduplicated', () => {
    const meals = [makeMeal({ id: 'pasta', name: 'Pasta' }), makeMeal({ id: 'soup', name: 'Soup' })]
    const entries = [
      makeMealPlanEntry({ meal_id: 'soup', entry_date: '2026-07-10' }),
      makeMealPlanEntry({ meal_id: 'pasta', entry_date: '2026-07-12' }),
      makeMealPlanEntry({ meal_id: 'pasta', entry_date: '2026-07-05' }), // older duplicate use
    ]
    const result = recentlyUsedMeals(meals, entries, TODAY, 14)
    expect(result.map((m) => m.id)).toEqual(['pasta', 'soup'])
  })

  it('excludes future-planned entries and entries older than the window', () => {
    const meals = [makeMeal({ id: 'future' }), makeMeal({ id: 'old' })]
    const entries = [
      makeMealPlanEntry({ meal_id: 'future', entry_date: '2026-07-20' }), // future
      makeMealPlanEntry({ meal_id: 'old', entry_date: '2026-06-01' }), // outside window
    ]
    expect(recentlyUsedMeals(meals, entries, TODAY, 14)).toEqual([])
  })

  it('excludes archived meals even if recently used', () => {
    const meals = [makeMeal({ id: 'a', status: 'archived' })]
    const entries = [makeMealPlanEntry({ meal_id: 'a', entry_date: TODAY })]
    expect(recentlyUsedMeals(meals, entries, TODAY)).toEqual([])
  })
})

describe('notPlannedRecently', () => {
  it('excludes meals planned within the window and includes the rest', () => {
    const meals = [makeMeal({ id: 'planned' }), makeMeal({ id: 'not-planned' })]
    const entries = [makeMealPlanEntry({ meal_id: 'planned', entry_date: '2026-07-12' })]
    const result = notPlannedRecently(meals, entries, TODAY, 21)
    expect(result.map((m) => m.id)).toEqual(['not-planned'])
  })

  it('never suggests archived meals', () => {
    const meals = [makeMeal({ id: 'a', status: 'archived' })]
    expect(notPlannedRecently(meals, [], TODAY)).toEqual([])
  })
})

describe('quickMeals', () => {
  it('matches the "quick" tag case-insensitively', () => {
    const meals = [
      makeMeal({ id: 'a', tags: ['Quick'] }),
      makeMeal({ id: 'b', tags: ['weekend'] }),
      makeMeal({ id: 'c', tags: ['quick'], status: 'archived' }),
    ]
    expect(quickMeals(meals).map((m) => m.id)).toEqual(['a'])
  })
})

describe('topVotedMeals', () => {
  it('ranks meals by cumulative score across rounds, highest first', () => {
    const meals = [makeMeal({ id: 'a', name: 'A' }), makeMeal({ id: 'b', name: 'B' }), makeMeal({ id: 'c', name: 'C' })]
    const rounds = [
      makeRound({
        candidates: [
          makeMealVoteCandidate({ meal_id: 'a', votes: [makeMealVote({ value: 1 }), makeMealVote({ value: 1, member_id: 'm2' })] }),
          makeMealVoteCandidate({ meal_id: 'b', votes: [makeMealVote({ value: -1 })] }),
        ],
      }),
    ]
    expect(topVotedMeals(meals, rounds).map((m) => m.id)).toEqual(['a'])
  })

  it('sums scores across multiple rounds for the same meal', () => {
    const meals = [makeMeal({ id: 'a', name: 'A' })]
    const rounds = [
      makeRound({ candidates: [makeMealVoteCandidate({ meal_id: 'a', votes: [makeMealVote({ value: 1 })] })] }),
      makeRound({ candidates: [makeMealVoteCandidate({ meal_id: 'a', votes: [makeMealVote({ value: 1 })] })] }),
    ]
    expect(topVotedMeals(meals, rounds)).toHaveLength(1)
  })

  it('excludes meals with a non-positive score', () => {
    const meals = [makeMeal({ id: 'a' })]
    const rounds = [makeRound({ candidates: [makeMealVoteCandidate({ meal_id: 'a', votes: [makeMealVote({ value: -1 })] })] })]
    expect(topVotedMeals(meals, rounds)).toEqual([])
  })
})

describe('memberFavoriteMeals', () => {
  it('lists meals a specific member liked', () => {
    const meals = [makeMeal({ id: 'a' }), makeMeal({ id: 'b' })]
    const rounds = [
      makeRound({
        candidates: [
          makeMealVoteCandidate({ meal_id: 'a', votes: [makeMealVote({ member_id: 'viktor', value: 1 })] }),
          makeMealVoteCandidate({ meal_id: 'b', votes: [makeMealVote({ member_id: 'viktor', value: -1 })] }),
        ],
      }),
    ]
    expect(memberFavoriteMeals(meals, rounds, 'viktor').map((m) => m.id)).toEqual(['a'])
  })
})

describe('getMealBadges', () => {
  it('combines badges deterministically and keeps recentlyUsed/notPlannedRecently mutually exclusive', () => {
    const usedMeal = makeMeal({ id: 'used', tags: ['quick'] })
    const unusedMeal = makeMeal({ id: 'unused' })
    const ctx = {
      meals: [usedMeal, unusedMeal],
      planEntries: [makeMealPlanEntry({ meal_id: 'used', entry_date: TODAY })],
      voteRounds: [] as MealVoteRound[],
      today: TODAY,
    }
    expect(getMealBadges(usedMeal, ctx).sort()).toEqual(['quick', 'recentlyUsed'].sort())
    expect(getMealBadges(unusedMeal, ctx)).toEqual(['notPlannedRecently'])
  })
})

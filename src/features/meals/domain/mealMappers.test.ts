import { describe, expect, it } from 'vitest'
import {
  MEAL_PLAN_ENTRY_COLUMNS,
  mapMeal,
  mapMealPlanEntry,
  mapMealVote,
  mapMealVoteRound,
  mealInputToRow,
} from './mealMappers'

describe('meal mappers', () => {
  it('turns a null tag list into an empty one', () => {
    // Inserts return null, selects return [], and the UI only ever wants a list.
    expect(mapMeal({ id: 'm1', name: 'Svíčková', tags: null }).tags).toEqual([])
    expect(mapMeal({ id: 'm1', name: 'Svíčková', tags: ['beef'] }).tags).toEqual(['beef'])
  })

  it('drops non-string entries from a tag list rather than trusting the row', () => {
    expect(mapMeal({ id: 'm1', tags: ['ok', 7, null] }).tags).toEqual(['ok'])
  })

  it('parses numeric columns that arrive as strings', () => {
    // Postgres integer/numeric come back as strings often enough that a
    // forgotten Number() silently breaks comparisons.
    expect(mapMeal({ id: 'm1', prep_minutes: '45' }).prep_minutes).toBe(45)
    expect(mapMeal({ id: 'm1', prep_minutes: null }).prep_minutes).toBeNull()
    expect(mapMeal({ id: 'm1', prep_minutes: 'not a number' }).prep_minutes).toBeNull()
  })

  it('normalises empty strings to null for optional text', () => {
    expect(mapMeal({ id: 'm1', description: '' }).description).toBeNull()
    expect(mapMeal({ id: 'm1', description: 'nice' }).description).toBe('nice')
  })

  it('falls back to safe defaults for missing enums', () => {
    expect(mapMeal({ id: 'm1' }).status).toBe('active')
    expect(mapMeal({ id: 'm1' }).category).toBe('other')
    expect(mapMealPlanEntry({ id: 'p1' }).status).toBe('proposed')
    expect(mapMealPlanEntry({ id: 'p1' }).origin).toBe('manual')
  })

  it('treats a vote outside the ballot as an abstention', () => {
    expect(mapMealVote({ id: 'v1', value: 1 }).value).toBe(1)
    expect(mapMealVote({ id: 'v1', value: -1 }).value).toBe(-1)
    expect(mapMealVote({ id: 'v1', value: 5 }).value).toBe(0)
    expect(mapMealVote({ id: 'v1', value: null }).value).toBe(0)
  })

  it('maps a round with its nested candidates and votes', () => {
    const round = mapMealVoteRound({
      id: 'r1', family_id: 'f1', title: 'Víkend', status: 'open',
      candidates: [{
        id: 'c1', round_id: 'r1', meal_id: 'm1', meal_title: 'Svíčková',
        votes: [{ id: 'v1', candidate_id: 'c1', member_id: 'mem1', value: 1 }],
      }],
    })
    expect(round.candidates).toHaveLength(1)
    expect(round.candidates[0].votes[0].value).toBe(1)
  })

  it('survives a round with no candidates at all', () => {
    expect(mapMealVoteRound({ id: 'r1' }).candidates).toEqual([])
    expect(mapMealVoteRound({ id: 'r1', candidates: null }).candidates).toEqual([])
  })

  it('keeps one column list for meal_plan_entries', () => {
    // The plan columns were previously spelled out in both the meals loader
    // and the calendar snapshot. They agreed by luck; the day they stopped,
    // the calendar and the planner would show different data (audit P1-M1).
    for (const column of ['entry_date', 'meal_slot', 'meal_id', 'responsible_member_id', 'source_entry_id', 'status', 'origin']) {
      expect(MEAL_PLAN_ENTRY_COLUMNS).toContain(column)
    }
  })

  it('sends empty optional text to the server as null', () => {
    const row = mealInputToRow({
      name: 'Guláš', description: '', category: 'dinner', tags: [],
      prepMinutes: null, notes: '', sourceUrl: '', status: 'active',
    })
    expect(row.description).toBeNull()
    expect(row.notes).toBeNull()
    expect(row.source_url).toBeNull()
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor, act } from '@testing-library/react'
import { useMealsDataSource } from './useMealsDataSource'
import type { MealsRepository, MealsRealtimeHandlers } from '../../features/meals/data/mealsRepository'
import type { Meal, MealPlanEntry, MealVoteRound } from '../../features/meals/domain/mealTypes'

function meal(id: string, name = 'Svíčková'): Meal {
  return {
    id, family_id: 'f1', name, description: null, category: 'dinner', tags: [],
    prep_minutes: null, notes: null, source_url: null, status: 'active',
    created_by: 'u1', created_at: '2026-07-20T10:00:00Z', updated_at: '2026-07-20T10:00:00Z',
  }
}

function planEntry(id: string, date = '2026-07-21'): MealPlanEntry {
  return {
    id, family_id: 'f1', entry_date: date, meal_slot: 'dinner', meal_id: 'm1', title: null,
    responsible_member_id: null, notes: null, status: 'proposed', origin: 'manual',
    source_entry_id: null, created_by: 'u1', created_at: '2026-07-20T10:00:00Z', updated_at: '2026-07-20T10:00:00Z',
  }
}

function round(id: string, candidateId = 'c1'): MealVoteRound {
  return {
    id, family_id: 'f1', title: 'Víkend', description: null, status: 'open', deadline_at: null,
    created_by: 'u1', created_at: '2026-07-20T10:00:00Z', closed_at: null,
    candidates: [{ id: candidateId, round_id: id, meal_id: 'm1', meal_title: 'Svíčková', created_at: '2026-07-20T10:00:00Z', votes: [] }],
  }
}

/** Counts every call so "did this refetch the world?" is answerable. */
function fakeRepository(overrides: Partial<MealsRepository> = {}) {
  const calls = { listMealLibrary: 0, listPlanEntries: 0, listVoteRounds: 0 }
  let handlers: MealsRealtimeHandlers | null = null
  const repository: MealsRepository = {
    async listMealLibrary() { calls.listMealLibrary += 1; return [meal('m1')] },
    async listPlanEntries() { calls.listPlanEntries += 1; return [planEntry('p1')] },
    async listVoteRounds() { calls.listVoteRounds += 1; return [round('r1')] },
    async createMeal() { return meal('m2', 'Guláš') },
    async updateMealDetails() { return meal('m1', 'Svíčková v2') },
    async planMeal() { return planEntry('p2', '2026-07-22') },
    async reschedulePlanEntry() { return { ...planEntry('p1'), entry_date: '2026-07-25' } },
    async removePlanEntry() { /* no-op */ },
    async copyPlanWeek() { return [planEntry('p3', '2026-07-28')] },
    async createVoteRound() { return round('r2', 'c2') },
    async addCandidates() { return round('r1') },
    async openVoteRound() { return { ...round('r1'), status: 'open' } },
    async closeVoteRound() { return { ...round('r1'), status: 'closed' } },
    async recordVote() { return round('r1') },
    subscribe(_scope, next) { handlers = next; return () => { handlers = null } },
    ...overrides,
  }
  return { repository, calls, fire: () => handlers }
}

async function mounted(repository: MealsRepository) {
  const view = renderHook(() => useMealsDataSource('f1', 'u1', repository))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

afterEach(cleanup)

describe('meals wave 1 — targeted reconciliation', () => {
  it('loads each aggregate once on mount', async () => {
    const { repository, calls } = fakeRepository()
    await mounted(repository)
    expect(calls).toEqual({ listMealLibrary: 1, listPlanEntries: 1, listVoteRounds: 1 })
  })

  it('merges a created meal instead of reloading the domain', async () => {
    const { repository, calls } = fakeRepository()
    const view = await mounted(repository)

    await act(async () => {
      await view.result.current.addMeal({
        name: 'Guláš', description: '', category: 'dinner', tags: [],
        prepMinutes: null, notes: '', sourceUrl: '', status: 'active',
      })
    })

    expect(view.result.current.meals.map((entry) => entry.name)).toEqual(['Svíčková', 'Guláš'])
    // The old version ran refreshMeals + refreshVoteRounds + refreshPlanEntries
    // after every mutation. Adding a meal must not refetch the plan or voting.
    expect(calls).toEqual({ listMealLibrary: 1, listPlanEntries: 1, listVoteRounds: 1 })
  })

  it('merges an updated meal in place rather than appending it', async () => {
    const { repository } = fakeRepository()
    const view = await mounted(repository)

    await act(async () => {
      await view.result.current.updateMeal('m1', {
        name: 'Svíčková v2', description: '', category: 'dinner', tags: [],
        prepMinutes: null, notes: '', sourceUrl: '', status: 'active',
      })
    })

    expect(view.result.current.meals).toHaveLength(1)
    expect(view.result.current.meals[0].name).toBe('Svíčková v2')
  })

  it('merges plan add, move and remove without a plan reload', async () => {
    const { repository, calls } = fakeRepository()
    const view = await mounted(repository)
    const input = {
      entryDate: '2026-07-22', mealSlot: 'dinner' as const, mealId: 'm1', title: '',
      responsibleMemberId: null, notes: '', status: 'proposed' as const, origin: 'manual' as const, sourceEntryId: null,
    }

    await act(async () => { await view.result.current.addPlanEntry(input) })
    expect(view.result.current.planEntries.map((entry) => entry.id)).toEqual(['p1', 'p2'])

    await act(async () => { await view.result.current.updatePlanEntry('p1', input) })
    expect(view.result.current.planEntries.find((entry) => entry.id === 'p1')?.entry_date).toBe('2026-07-25')

    await act(async () => { await view.result.current.deletePlanEntry('p1') })
    expect(view.result.current.planEntries.map((entry) => entry.id)).toEqual(['p2'])

    expect(calls.listPlanEntries).toBe(1)
  })

  it('resolves the owning round before recording a vote', async () => {
    let seen: { roundId: string; candidateId: string } | null = null
    const { repository } = fakeRepository({
      async recordVote(_scope, roundId, candidateId) { seen = { roundId, candidateId }; return round('r1') },
    })
    const view = await mounted(repository)

    await act(async () => { await view.result.current.castVote('c1', 'mem1', 1) })

    // The repository is told which round to read back; it does not have to
    // join its way there from the vote row.
    expect(seen).toEqual({ roundId: 'r1', candidateId: 'c1' })
  })

  it('refuses a vote for a candidate that belongs to no loaded round', async () => {
    const { repository } = fakeRepository()
    const view = await mounted(repository)
    await expect(view.result.current.castVote('unknown-candidate', 'mem1', 1)).rejects.toThrow()
  })

  it('applies a realtime meal insert without refetching', async () => {
    const { repository, calls, fire } = fakeRepository()
    const view = await mounted(repository)

    await act(async () => { fire()?.onMealChange({ action: 'insert', record: meal('m9', 'Řízek') }) })

    expect(view.result.current.meals.map((entry) => entry.name)).toContain('Řízek')
    expect(calls.listMealLibrary).toBe(1)
  })

  it('does not duplicate a meal when the realtime echo of our own insert arrives', async () => {
    const { repository, fire } = fakeRepository()
    const view = await mounted(repository)

    await act(async () => {
      await view.result.current.addMeal({
        name: 'Guláš', description: '', category: 'dinner', tags: [],
        prepMinutes: null, notes: '', sourceUrl: '', status: 'active',
      })
    })
    await act(async () => { fire()?.onMealChange({ action: 'insert', record: meal('m2', 'Guláš') }) })

    // Optimistic merge then realtime echo, both keyed by id.
    expect(view.result.current.meals.filter((entry) => entry.id === 'm2')).toHaveLength(1)
  })


  it('plans a custom meal only in the plan when library save is off', async () => {
    const createdMeals: string[] = []
    let planned: any = null
    const { repository } = fakeRepository({
      async createMeal(_scope, input) { createdMeals.push(input.name); return meal('created', input.name) },
      async planMeal(_scope, input) { planned = input; return { ...planEntry('p2'), meal_id: input.mealId, title: input.title } },
    })
    const view = await mounted(repository)

    await act(async () => { await view.result.current.addPlanEntry({
      entryDate: '2026-07-22', mealSlot: 'dinner', mealId: null, title: '  Tacos  ',
      responsibleMemberId: null, notes: 'with salsa', status: 'proposed', origin: 'manual', sourceEntryId: null,
    }) })

    expect(createdMeals).toEqual([])
    expect(planned).toMatchObject({ mealId: null, title: '  Tacos  ' })
  })

  it('saves a custom planned meal to the library when requested', async () => {
    let createdInput: any = null
    let planned: any = null
    const { repository } = fakeRepository({
      async createMeal(_scope, input) { createdInput = input; return meal('created', input.name) },
      async planMeal(_scope, input) { planned = input; return { ...planEntry('p2'), meal_id: input.mealId, title: input.title } },
    })
    const view = await mounted(repository)

    await act(async () => { await view.result.current.addPlanEntry({
      entryDate: '2026-07-22', mealSlot: 'lunch', mealId: null, title: 'Tacos',
      responsibleMemberId: null, notes: 'with salsa', status: 'proposed', origin: 'manual', sourceEntryId: null, saveToLibrary: true,
    }) })

    expect(createdInput).toMatchObject({ name: 'Tacos', category: 'lunch', notes: 'with salsa', status: 'active' })
    expect(planned).toMatchObject({ mealId: 'created', title: 'Tacos' })
  })

  it('uses a normalized existing library meal instead of overwriting or duplicating it', async () => {
    let createCount = 0
    let updateCount = 0
    let planned: any = null
    const { repository } = fakeRepository({
      async createMeal(_scope, input) { createCount += 1; return meal('created', input.name) },
      async updateMealDetails() { updateCount += 1; return meal('m1', 'changed') },
      async planMeal(_scope, input) { planned = input; return { ...planEntry('p2'), meal_id: input.mealId, title: input.title } },
    })
    const view = await mounted(repository)

    await act(async () => { await view.result.current.addPlanEntry({
      entryDate: '2026-07-22', mealSlot: 'dinner', mealId: null, title: '  SVÍČKOVÁ  ',
      responsibleMemberId: null, notes: 'new note must not overwrite existing', status: 'proposed', origin: 'manual', sourceEntryId: null, saveToLibrary: true,
    }) })

    expect(createCount).toBe(0)
    expect(updateCount).toBe(0)
    expect(planned).toMatchObject({ mealId: 'm1', title: 'Svíčková' })
  })

  it('applies a realtime plan delete', async () => {
    const { repository, fire } = fakeRepository()
    const view = await mounted(repository)

    await act(async () => { fire()?.onPlanEntryChange({ action: 'delete', id: 'p1' }) })

    expect(view.result.current.planEntries).toEqual([])
  })

  it('re-reads voting when a candidate changes remotely, and nothing else', async () => {
    const { repository, calls, fire } = fakeRepository()
    const view = await mounted(repository)

    await act(async () => { fire()?.onVoteRoundChange('candidate:c1') })

    await waitFor(() => expect(calls.listVoteRounds).toBe(2))
    expect(calls.listMealLibrary).toBe(1)
    expect(calls.listPlanEntries).toBe(1)
    expect(view.result.current.voteRounds).toHaveLength(1)
  })

  it('surfaces a load failure as a safe message, not a Postgres string', async () => {
    const { repository } = fakeRepository({
      async listMealLibrary() { throw new Error('permission denied for table meals') },
    })
    const view = await mounted(repository)

    expect(view.result.current.error).toBeTruthy()
    expect(view.result.current.error).not.toContain('permission denied')
  })

  it('lets a mutation error reach the caller for the form to handle', async () => {
    const { repository } = fakeRepository({
      async createMeal() { throw new Error('meals:meals.create:conflict') },
    })
    const view = await mounted(repository)

    await expect(view.result.current.addMeal({
      name: 'Guláš', description: '', category: 'dinner', tags: [],
      prepMinutes: null, notes: '', sourceUrl: '', status: 'active',
    })).rejects.toThrow()
  })
})

describe('meals wave 1 — provider boundary', () => {
  it('keeps Supabase out of the meals context', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    // import.meta.url is not a file: URL under the jsdom transform.
    const source = readFileSync(join(process.cwd(), 'src/context/meals/useMealsDataSource.ts'), 'utf8')
    // The provider composes the repository; it must not reach past it.
    expect(source).not.toContain('supabaseClient')
    expect(source).not.toContain('.rpc(')
    expect(source).not.toContain('.channel(')
  })
})

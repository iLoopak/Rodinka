// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  repositoryStart: vi.fn(),
  repositorySync: vi.fn(),
}))

vi.mock('../../supabaseClient', () => ({ supabase: { from: mocks.from, rpc: vi.fn() } }))
vi.mock('../../shopping/shoppingIndexedDb', () => ({ getShoppingLocalStore: () => ({}) }))
vi.mock('../../shopping/shoppingRepository', () => ({
  ShoppingRepository: class {
    subscribe() { return () => undefined }
    start() { return mocks.repositoryStart() }
    stop() { return Promise.resolve() }
    sync() { return mocks.repositorySync() }
  },
}))

import { useShoppingDataSource } from './useShoppingDataSource'

beforeEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  mocks.repositoryStart.mockReset().mockResolvedValue(undefined)
  mocks.repositorySync.mockReset().mockResolvedValue(undefined)
  mocks.limit.mockReset().mockResolvedValue({ data: [], error: null })
  mocks.order.mockReset().mockReturnValue({ limit: mocks.limit })
  mocks.select.mockReset().mockReturnValue({ order: mocks.order })
  mocks.from.mockReset().mockReturnValue({ select: mocks.select })
})

afterEach(cleanup)

describe('meal ingredient deferral', () => {
  it('does not read meal_ingredients during shopping startup or refresh', async () => {
    const { result } = renderHook(() => useShoppingDataSource('family-1', 'user-1', 'member-1'))
    await waitFor(() => expect(mocks.repositoryStart).toHaveBeenCalledTimes(1))
    expect(mocks.from).not.toHaveBeenCalled()
    await act(async () => { await result.current.refreshShopping() })
    expect(mocks.repositorySync).toHaveBeenCalledTimes(1)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent ingredient consumers', async () => {
    let resolveQuery!: (result: { data: never[]; error: null }) => void
    mocks.limit.mockReturnValue(new Promise((resolve) => { resolveQuery = resolve }))
    const { result } = renderHook(() => useShoppingDataSource('family-1', 'user-1', 'member-1'))
    await waitFor(() => expect(mocks.repositoryStart).toHaveBeenCalledTimes(1))

    await act(async () => {
      const first = result.current.ensureMealIngredients()
      const second = result.current.ensureMealIngredients()
      expect(mocks.from).toHaveBeenCalledTimes(1)
      resolveQuery({ data: [], error: null })
      await Promise.all([first, second])
    })

    expect(result.current.mealIngredientsStatus).toBe('ready')
  })
})

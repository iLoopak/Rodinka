// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), inFilter: vi.fn() }))

vi.mock('../supabaseClient', () => ({
  supabase: { from: mocks.from },
}))

import { useChildAccounts } from './useChildAccounts'

beforeEach(() => {
  mocks.inFilter.mockReset().mockResolvedValue({ data: [], error: null })
  mocks.select.mockReset().mockReturnValue({ in: mocks.inFilter })
  mocks.from.mockReset().mockReturnValue({ select: mocks.select })
})

afterEach(cleanup)

describe('useChildAccounts lifecycle', () => {
  it('performs exactly one initial request and ignores array identity changes', async () => {
    const { rerender } = renderHook(
      ({ ids }) => useChildAccounts(ids, true, 'child-1:linked:active'),
      { initialProps: { ids: ['child-1'] } },
    )
    await waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(1))
    rerender({ ids: ['child-1'] })
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it('loads a changed membership scope and still supports manual refresh', async () => {
    const { result, rerender } = renderHook(
      ({ ids, signature }) => useChildAccounts(ids, true, signature),
      { initialProps: { ids: ['child-1'], signature: 'child-1:linked:active' } },
    )
    await waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(1))
    rerender({ ids: ['child-1', 'child-2'], signature: 'child-1:linked:active,child-2::active' })
    await waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(2))
    await act(async () => { await result.current.refresh() })
    expect(mocks.from).toHaveBeenCalledTimes(3)
  })
})

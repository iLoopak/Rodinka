// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ from: vi.fn(), createSignedUrls: vi.fn() }))

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: () => ({ createSignedUrls: mocks.createSignedUrls }) },
  },
}))

import { useFamilyMembers } from './useFamilyMembers'
import { createMemoryQueryCachePersistence, setQueryCachePersistenceForTests } from '../queryCache'

/** Mimics the chained Postgrest builder useFamilyMembers calls. */
function respondWith(result: { data: unknown; error: unknown }) {
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ order: async () => result }) }),
  })
}

const roster = [{
  id: 'member-1', family_id: 'family-a', display_name: 'Ema', role: 'child',
  user_id: null, birth_date: '2015-03-02', color_key: 'mint', custom_color: null,
  avatar_path: null, grammatical_gender: 'feminine', vocative_name: null,
  status: 'active', removed_at: null, removed_by_member_id: null, removal_reason: null,
}]

beforeEach(() => {
  vi.clearAllMocks()
  setQueryCachePersistenceForTests(createMemoryQueryCachePersistence())
  mocks.createSignedUrls.mockResolvedValue({ data: [], error: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setQueryCachePersistenceForTests(null)
})

describe('family roster after losing access', () => {
  it('clears the roster when the server refuses, rather than showing the cached one', async () => {
    respondWith({ data: roster, error: null })
    const first = renderHook(() => useFamilyMembers('family-a', 'user-a'))
    await waitFor(() => expect(first.result.current.members).toHaveLength(1))
    first.unmount()

    // Come back after the entry has gone stale, so a refresh is actually
    // attempted. Inside the stale window nothing asks the server at all —
    // there, a removed member is cleared by the realtime event instead.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 46 * 60 * 1000)
    // The parent has been removed from the family; every read now trips RLS.
    respondWith({ data: null, error: { code: '42501', message: 'permission denied for table members' } })
    const second = renderHook(() => useFamilyMembers('family-a', 'user-a'))

    await waitFor(() => expect(second.result.current.loading).toBe(false))
    // Names, birth dates and avatar URLs of a family they no longer belong to
    // must not stay on screen for the remainder of maxAge.
    expect(second.result.current.members).toEqual([])
    expect(second.result.current.error).toBeTruthy()
  })

  it('still shows the cached roster through a network outage', async () => {
    respondWith({ data: roster, error: null })
    const first = renderHook(() => useFamilyMembers('family-a', 'user-b'))
    await waitFor(() => expect(first.result.current.members).toHaveLength(1))
    first.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 46 * 60 * 1000)
    respondWith({ data: null, error: new TypeError('Failed to fetch') })
    const second = renderHook(() => useFamilyMembers('family-a', 'user-b'))

    // Offline capability is the reason the fallback exists; the permission
    // fix must not cost it.
    await waitFor(() => expect(second.result.current.members).toHaveLength(1))
  })
})

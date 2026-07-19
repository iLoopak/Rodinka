// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFamilyMember } from '../utils/testFixtures'

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  loadFamilyIdentity: vi.fn(),
  saveFamilyIdentity: vi.fn(),
}))

vi.mock('../supabaseClient', () => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: mocks.maybeSingle,
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return { supabase: { from: vi.fn(() => builder) } }
})

vi.mock('../shopping/shoppingIndexedDb', () => ({
  getShoppingLocalStore: () => ({
    loadFamilyIdentity: mocks.loadFamilyIdentity,
    saveFamilyIdentity: mocks.saveFamilyIdentity,
  }),
}))

import { useFamily } from './useFamily'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

const member = makeFamilyMember({ id: 'member-1', user_id: 'user-1', family_id: 'family-1' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadFamilyIdentity.mockResolvedValue(null)
  mocks.saveFamilyIdentity.mockResolvedValue(undefined)
})

describe('useFamily membership scope', () => {
  it('does not turn the unauthenticated idle state into a missing-family result', async () => {
    const { result } = renderHook(() => useFamily(undefined))
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.member).toBeNull()
    expect(result.current.resolved).toBe(false)
    expect(mocks.loadFamilyIdentity).not.toHaveBeenCalled()
  })

  it('stays loading while a membership request is pending, even with no cached row', async () => {
    const query = deferred<{ data: null; error: null }>()
    mocks.maybeSingle.mockReturnValue(query.promise)
    const { result } = renderHook(() => useFamily('user-1'))

    await waitFor(() => expect(mocks.loadFamilyIdentity).toHaveBeenCalledWith('user-1'))
    expect(result.current.status).toBe('loading')
    expect(result.current.member).toBeNull()

    await act(async () => query.resolve({ data: null, error: null }))
    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.member).toBeNull()
  })

  it('does not open the app from cache before the live lookup settles', async () => {
    const query = deferred<{ data: null; error: Error }>()
    mocks.loadFamilyIdentity.mockResolvedValue(member)
    mocks.maybeSingle.mockReturnValue(query.promise)
    const { result } = renderHook(() => useFamily('user-1'))

    await waitFor(() => expect(mocks.loadFamilyIdentity).toHaveBeenCalled())
    expect(result.current.status).toBe('loading')
    expect(result.current.member).toBeNull()

    await act(async () => query.resolve({ data: null, error: new Error('network unavailable') }))
    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.member?.id).toBe(member.id)
    expect(result.current.connectionError).toBe('network unavailable')
  })

  it('never exposes a previous user membership after the session changes', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: member, error: null })
    const secondQuery = deferred<{ data: null; error: null }>()
    mocks.maybeSingle.mockReturnValueOnce(secondQuery.promise)
    const { result, rerender } = renderHook(({ userId }) => useFamily(userId), {
      initialProps: { userId: 'user-1' as string | undefined },
    })
    await waitFor(() => expect(result.current.member?.id).toBe(member.id))

    rerender({ userId: 'user-2' })
    expect(result.current.userId).toBe('user-2')
    expect(result.current.status).toBe('loading')
    expect(result.current.member).toBeNull()

    await act(async () => secondQuery.resolve({ data: null, error: null }))
    await waitFor(() => expect(result.current.status).toBe('resolved'))
  })
})

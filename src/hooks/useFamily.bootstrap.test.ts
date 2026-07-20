// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFamilyMember } from '../utils/testFixtures'

const maybeSingle = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn(() => {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) builder[method] = () => builder
  builder.maybeSingle = maybeSingle
  return builder
}))

vi.mock('../supabaseClient', () => ({ supabase: { from: fromMock } }))

const loadFamilyIdentity = vi.hoisted(() => vi.fn())
const saveFamilyIdentity = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../shopping/shoppingIndexedDb', () => ({
  getShoppingLocalStore: () => ({ loadFamilyIdentity, saveFamilyIdentity }),
}))

import { useFamily } from './useFamily'

const cachedMember = makeFamilyMember({ id: 'member-1', user_id: 'user-1', family_id: 'family-cached' })
const serverMember = makeFamilyMember({ id: 'member-1', user_id: 'user-1', family_id: 'family-server' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function goOffline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  loadFamilyIdentity.mockResolvedValue(null)
  maybeSingle.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('family bootstrap parallelization', () => {
  it('issues the membership query without waiting for the identity cache', async () => {
    const cache = deferred<unknown>()
    loadFamilyIdentity.mockReturnValue(cache.promise)
    const membership = deferred<unknown>()
    maybeSingle.mockReturnValue(membership.promise)

    renderHook(() => useFamily('user-1'))

    // The cache has not answered and must not be the reason the network waits.
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('members'))
    expect(loadFamilyIdentity).toHaveBeenCalledWith('user-1')

    cache.resolve(null)
    membership.resolve({ data: serverMember, error: null })
  })

  it('opens the shell on cached identity while the server answer is in flight', async () => {
    loadFamilyIdentity.mockResolvedValue(cachedMember)
    const membership = deferred<unknown>()
    maybeSingle.mockReturnValue(membership.promise)

    const { result } = renderHook(() => useFamily('user-1'))

    await waitFor(() => expect(result.current.status).toBe('cached-validating'))
    expect(result.current.member?.family_id).toBe('family-cached')
    expect(result.current.validating).toBe(true)
    // Still explicitly not "resolved" — the UI must be able to say so.
    expect(result.current.resolved).toBe(false)

    membership.resolve({ data: serverMember, error: null })
    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.member?.family_id).toBe('family-server')
    expect(result.current.validating).toBe(false)
  })

  it('lets a fast server answer win without any cached-validating flash', async () => {
    const cache = deferred<unknown>()
    loadFamilyIdentity.mockReturnValue(cache.promise)
    maybeSingle.mockResolvedValue({ data: serverMember, error: null })

    const { result } = renderHook(() => useFamily('user-1'))
    await waitFor(() => expect(result.current.status).toBe('resolved'))

    // A late cache read must not drag the confirmed answer backwards.
    cache.resolve(cachedMember)
    await Promise.resolve()
    expect(result.current.status).toBe('resolved')
    expect(result.current.member?.family_id).toBe('family-server')
  })

  it('clears cached identity when membership is confirmed empty', async () => {
    loadFamilyIdentity.mockResolvedValue(cachedMember)
    const membership = deferred<unknown>()
    maybeSingle.mockReturnValue(membership.promise)

    const { result } = renderHook(() => useFamily('user-1'))
    await waitFor(() => expect(result.current.status).toBe('cached-validating'))

    membership.resolve({ data: null, error: null })
    await waitFor(() => expect(result.current.status).toBe('resolved'))
    // Onboarding, not a stale family.
    expect(result.current.member).toBeNull()
  })

  it('never leaves cached family data on screen after a permission error', async () => {
    loadFamilyIdentity.mockResolvedValue(cachedMember)
    const membership = deferred<unknown>()
    maybeSingle.mockReturnValue(membership.promise)

    const { result } = renderHook(() => useFamily('user-1'))
    await waitFor(() => expect(result.current.status).toBe('cached-validating'))

    membership.resolve({ data: null, error: { message: 'permission denied for table members' } })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.member).toBeNull()
    expect(result.current.dataError).toContain('permission denied')
    expect(result.current.connectionError).toBeNull()
  })

  it('keeps cached identity usable through a genuine network outage', async () => {
    // The production signal for "device is offline" is navigator.onLine, not
    // the error text — a PostgrestError is a plain object, not an Error.
    goOffline()
    loadFamilyIdentity.mockResolvedValue(cachedMember)
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })

    const { result } = renderHook(() => useFamily('user-1'))
    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.member?.family_id).toBe('family-cached')
    expect(result.current.connectionError).toBe('TypeError: Failed to fetch')
    expect(result.current.dataError).toBeNull()
  })

  it('falls back to the cache even when it answers after the failed request', async () => {
    // Ordering must not decide whether the offline app opens: the cache read
    // is started in parallel, so the failure path has to await it.
    goOffline()
    const cache = deferred<unknown>()
    loadFamilyIdentity.mockReturnValue(cache.promise)
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })

    const { result } = renderHook(() => useFamily('user-1'))
    await Promise.resolve()
    cache.resolve(cachedMember)

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.member?.family_id).toBe('family-cached')
  })

  it('treats a network-shaped Error as an outage even while the browser reports online', async () => {
    loadFamilyIdentity.mockResolvedValue(cachedMember)
    maybeSingle.mockResolvedValue({ data: null, error: new Error('Failed to fetch') })

    const { result } = renderHook(() => useFamily('user-1'))
    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.member?.family_id).toBe('family-cached')
  })

  it('ignores an in-flight response belonging to a previous user id', async () => {
    loadFamilyIdentity.mockResolvedValue(null)
    const first = deferred<unknown>()
    maybeSingle.mockReturnValueOnce(first.promise)
    const second = deferred<unknown>()
    maybeSingle.mockReturnValueOnce(second.promise)

    const { result, rerender } = renderHook(({ userId }) => useFamily(userId), {
      initialProps: { userId: 'user-1' as string | undefined },
    })
    rerender({ userId: 'user-2' })

    // user-1's answer lands after the switch and must be dropped entirely.
    first.resolve({ data: makeFamilyMember({ id: 'member-1', user_id: 'user-1', family_id: 'family-a' }), error: null })
    await Promise.resolve()
    expect(result.current.member).toBeNull()

    second.resolve({ data: makeFamilyMember({ id: 'member-2', user_id: 'user-2', family_id: 'family-b' }), error: null })
    await waitFor(() => expect(result.current.member?.family_id).toBe('family-b'))
    expect(result.current.userId).toBe('user-2')
  })

  it('does not let a hung cache read delay the confirmed answer', async () => {
    // Before Wave 6 this awaited the cache first, so a stuck IndexedDB read
    // held the shell for its full timeout before the query even started.
    loadFamilyIdentity.mockReturnValue(new Promise(() => undefined))
    maybeSingle.mockResolvedValue({ data: serverMember, error: null })

    const { result } = renderHook(() => useFamily('user-1'))

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.member?.family_id).toBe('family-server')
  })

  it('does not persist a member for the wrong user id', async () => {
    loadFamilyIdentity.mockResolvedValue(null)
    maybeSingle.mockResolvedValue({ data: serverMember, error: null })

    renderHook(() => useFamily('user-1'))
    await waitFor(() => expect(saveFamilyIdentity).toHaveBeenCalled())
    expect(saveFamilyIdentity).toHaveBeenCalledWith('user-1', expect.objectContaining({ user_id: 'user-1' }))
  })
})

// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: auth.onAuthStateChange,
    },
  },
}))

import { useSession } from './useSession'

const session = {
  user: { id: 'user-1', email: 'parent@example.com', app_metadata: {}, user_metadata: {} },
} as Session

let authListener: ((event: string, session: Session | null) => void) | undefined

beforeEach(() => {
  vi.clearAllMocks()
  authListener = undefined
  auth.onAuthStateChange.mockImplementation((listener) => {
    authListener = listener
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } }
  })
})

describe('useSession', () => {
  it('renders auth loading until the initial Supabase request settles', () => {
    auth.getSession.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useSession())
    expect(result.current.session).toBeUndefined()
    expect(result.current.loading).toBe(true)
  })

  it('restores a valid session and treats an invalid session as anonymous', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    const valid = renderHook(() => useSession())
    await waitFor(() => expect(valid.result.current.session).toBe(session))
    valid.unmount()

    auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid refresh token' } })
    const expired = renderHook(() => useSession())
    await waitFor(() => expect(expired.result.current.session).toBeNull())
  })

  it('does not let a stale getSession response overwrite a newer sign-out event', async () => {
    let resolveInitial: ((value: unknown) => void) | undefined
    auth.getSession.mockReturnValue(new Promise((resolve) => { resolveInitial = resolve }))
    const { result } = renderHook(() => useSession())

    act(() => authListener?.('SIGNED_OUT', null))
    expect(result.current.session).toBeNull()

    await act(async () => {
      resolveInitial?.({ data: { session }, error: null })
      await Promise.resolve()
    })
    expect(result.current.session).toBeNull()
  })

  it('reports an auth timeout as retryable instead of a sign-out', async () => {
    vi.useFakeTimers()
    auth.getSession.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useSession())

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

    // The user never signed out — claiming they did would send them to a
    // login form for a session they may still hold.
    expect(result.current.status).toBe('unavailable')
    expect(result.current.session).toBeUndefined()
    expect(result.current.authError).toBe('auth-init-timeout')
    vi.useRealTimers()
  })

  it('retries the whole auth bootstrap on demand', async () => {
    vi.useFakeTimers()
    auth.getSession.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useSession())
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current.status).toBe('unavailable')

    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    await act(async () => { result.current.retry() })
    vi.useRealTimers()

    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    expect(result.current.session).toBe(session)
    expect(result.current.authError).toBeNull()
  })

  it('treats an unreachable auth endpoint as unresolved, not anonymous', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'TypeError: Failed to fetch' } })
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.session).toBeUndefined()
  })

  it('treats a rejected getSession as unresolved', async () => {
    auth.getSession.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.authError).toBe('getSession-rejected')
  })

  it('still treats an expired refresh token as a confirmed anonymous session', async () => {
    // This IS an answer from the server: there is no usable session. It must
    // keep routing to the login screen rather than into a retry loop.
    auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid refresh token' } })
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.status).toBe('anonymous'))
    expect(result.current.session).toBeNull()
  })

  it('follows sign-in and sign-out events after initialization', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.session).toBeNull())

    act(() => authListener?.('SIGNED_IN', session))
    expect(result.current.session).toBe(session)
    act(() => authListener?.('SIGNED_OUT', null))
    expect(result.current.session).toBeNull()
  })
})

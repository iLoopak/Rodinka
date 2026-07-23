// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }))
const appMock = vi.hoisted(() => ({ addListener: vi.fn() }))
vi.mock('../supabaseClient', () => ({ supabase: { auth } }))
vi.mock('@capacitor/browser', () => ({ Browser: { close: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@capacitor/app', () => ({ App: appMock }))

import {
  handleIncomingUrlForTests as handleIncomingUrl,
  registerNativeDeepLinks,
  resetNativeDeepLinksForTests,
} from './nativeDeepLinks'
import { RouterProvider, useRoutePath, useRouteSearchParams } from '../router'

describe('native deep link dispatch', () => {
  beforeEach(() => {
    resetNativeDeepLinksForTests()
    vi.clearAllMocks()
    appMock.addListener.mockResolvedValue({ remove: vi.fn() })
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('exchanges the code for a session on the auth callback URL', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null })
    const url = 'cz.rodinka.app://auth/callback?code=abc123'
    handleIncomingUrl(url)
    await vi.waitFor(() => expect(auth.exchangeCodeForSession).toHaveBeenCalledWith(url))
  })

  it('never exchanges the same callback URL twice', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null })
    const url = 'cz.rodinka.app://auth/callback?code=abc123'
    handleIncomingUrl(url)
    handleIncomingUrl(url)
    await vi.waitFor(() => expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1))
  })

  it('applies a known in-app route via pushState', () => {
    handleIncomingUrl('cz.rodinka.app://open/calendar?date=2026-07-23')
    expect(window.location.pathname).toBe('/calendar')
    expect(window.location.search).toBe('?date=2026-07-23')
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('falls back to home for an unknown route rather than failing open', () => {
    handleIncomingUrl('cz.rodinka.app://open/not-a-real-route')
    expect(window.location.pathname).toBe('/')
  })

  it('ignores a foreign scheme entirely', () => {
    handleIncomingUrl('https://evil.example/calendar')
    expect(window.location.pathname).toBe('/')
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('ignores an unparseable URL without throwing', () => {
    expect(() => handleIncomingUrl('not a url')).not.toThrow()
  })

  it('registers the appUrlOpen listener only once across repeated calls', () => {
    registerNativeDeepLinks()
    registerNativeDeepLinks()
    registerNativeDeepLinks()
    expect(appMock.addListener).toHaveBeenCalledTimes(1)
    expect(appMock.addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function))
  })

  describe('deep link received before the router has mounted', () => {
    afterEach(cleanup)

    function RouteProbe() {
      const path = useRoutePath()
      const search = useRouteSearchParams()
      return <output data-testid="probe">{path}{search.toString()}</output>
    }

    it('survives to be picked up once RouterProvider mounts (cold-start case)', () => {
      // Simulates a cold start: the deep link arrives (and updates
      // window.location via pushState) before any React tree — let alone
      // the router — exists yet.
      handleIncomingUrl('cz.rodinka.app://open/calendar?date=2026-07-23')
      expect(window.location.pathname).toBe('/calendar')

      render(<RouterProvider><RouteProbe /></RouterProvider>)
      expect(screen.getByTestId('probe').textContent).toBe('/calendardate=2026-07-23')
    })
  })
})

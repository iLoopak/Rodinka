// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFamilyMember } from './utils/testFixtures'
import { t } from './strings'

const hooks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useFamily: vi.fn(),
  useNetworkStatus: vi.fn(),
}))

vi.mock('./hooks/useSession', () => ({ useSession: hooks.useSession }))
vi.mock('./hooks/useFamily', () => ({ useFamily: hooks.useFamily }))
vi.mock('./i18n/languageContext', () => ({ useLanguage: () => ({}) }))
vi.mock('./components/AuthScreen', () => ({ AuthScreen: () => <div data-testid="auth-screen" /> }))
vi.mock('./components/OnboardingScreen', () => ({ OnboardingScreen: () => <div data-testid="onboarding-screen" /> }))
vi.mock('./components/AppShell', () => ({ AppShell: () => <div data-testid="app-shell" /> }))
vi.mock('./components/OfflineFallbackScreen', () => ({ OfflineFallbackScreen: () => <div data-testid="offline-fallback" /> }))
vi.mock('./components/UnlinkedChildAccountScreen', () => ({ UnlinkedChildAccountScreen: () => <div data-testid="unlinked-child" /> }))
vi.mock('./components/FamilyMark', () => ({ FamilyMark: () => <span data-testid="loading-mark" /> }))
vi.mock('./router', () => ({
  RouterProvider: ({ children }: { children: ReactNode }) => children,
  useRouter: () => ({ path: '/', navigate: vi.fn() }),
}))
// Records one entry per MOUNT (not per render), so the test can tell a keyed
// remount apart from a re-render that reuses the previous scope's state.
const providerMounts = vi.hoisted(() => [] as string[])
vi.mock('./context/AppDataProviders', async () => {
  const { useEffect } = await import('react')
  return {
    AppDataProviders: ({ children, member, userId }: { children: ReactNode; member: { family_id: string }; userId: string }) => {
      useEffect(() => { providerMounts.push(`${userId}:${member.family_id}`) }, [])
      return children
    },
  }
})
vi.mock('./context/ReminderContext', () => ({ ReminderProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/PushContext', () => ({ PushProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/create-record/CreateRecordContext', () => ({ CreateRecordProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/calendar/CalendarOfflineContext', () => ({ useCalendarOffline: () => ({ calendarHasUsableData: false }) }))
vi.mock('./network/useNetworkStatus', () => ({ useNetworkStatus: hooks.useNetworkStatus }))

import App from './App'

const session = {
  user: { id: 'user-1', email: 'parent@example.com', app_metadata: {}, user_metadata: {} },
} as Session
const member = makeFamilyMember({ id: 'member-1', user_id: 'user-1', family_id: 'family-1' })
const refresh = vi.fn()

const retryAuth = vi.fn()

function family(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    status: 'resolved',
    member: null,
    loading: false,
    validating: false,
    resolved: true,
    refresh,
    connectionError: null,
    ...overrides,
  }
}

function auth(overrides: Record<string, unknown> = {}) {
  return { session: null, status: 'anonymous', authError: null, retry: retryAuth, loading: false, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  providerMounts.length = 0
  window.history.replaceState(null, '', '/')
  hooks.useSession.mockReturnValue(auth())
  hooks.useFamily.mockReturnValue(family({ userId: null, status: 'idle', resolved: false }))
  hooks.useNetworkStatus.mockReturnValue('online')
})

afterEach(cleanup)

describe('App authentication routing', () => {
  it('shows only splash while Supabase auth is unresolved', () => {
    hooks.useSession.mockReturnValue(auth({ session: undefined, status: 'loading', loading: true }))
    render(<App />)
    expect(screen.getByText(t.loading.session)).toBeTruthy()
    expect(screen.queryByTestId('auth-screen')).toBeNull()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('shows auth for an anonymous root visit and refresh', () => {
    const first = render(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
    first.unmount()
    render(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
  })

  it('shows auth instead of protected content at a protected URL', () => {
    window.history.replaceState(null, '', '/calendar')
    render(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('shows family loading without flashing onboarding during a slow lookup', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ status: 'loading', resolved: false }))
    render(<App />)
    expect(screen.getByText(t.loading.family)).toBeTruthy()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
  })

  it('shows onboarding only for an authenticated, resolved user without a family', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family())
    render(<App />)
    expect(screen.getByTestId('onboarding-screen')).toBeTruthy()
    expect(screen.queryByTestId('auth-screen')).toBeNull()
  })

  it('opens the app for an authenticated family member', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ member }))
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('moves from registration auth to onboarding only after a session exists', () => {
    const view = render(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()

    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family())
    view.rerender(<App />)
    expect(screen.getByTestId('onboarding-screen')).toBeTruthy()
  })

  it('returns directly to auth after sign-out even if old family data still exists', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ member }))
    const view = render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()

    hooks.useSession.mockReturnValue(auth())
    view.rerender(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
  })

  it('shows an error with retry instead of a permanent loader for an online membership request failure', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ status: 'error', resolved: false, connectionError: 'network unavailable' }))
    render(<App />)
    expect(screen.getByRole('alert').textContent).toBe(t.errors.loadFailed)
    expect(screen.getByRole('button', { name: t.errors.retry })).toBeTruthy()
    expect(screen.queryByTestId('offline-fallback')).toBeNull()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
  })

  it('uses the offline fallback only when the browser reports offline', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useNetworkStatus.mockReturnValue('offline')
    hooks.useFamily.mockReturnValue(family({ status: 'error', resolved: false, connectionError: 'network unavailable' }))
    render(<App />)
    expect(screen.getByTestId('offline-fallback')).toBeTruthy()
  })
})

describe('App managed child routing', () => {
  const childSession = {
    user: { id: 'child-1', email: null, app_metadata: { account_type: 'managed_child' }, user_metadata: {} },
  } as unknown as Session
  const childMember = makeFamilyMember({ id: 'member-3', user_id: 'child-1', family_id: 'family-1', role: 'child' })

  it('shows the unlinked screen instead of onboarding for a child without a family', () => {
    hooks.useSession.mockReturnValue(auth({ session: childSession, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ userId: 'child-1' }))
    render(<App />)
    expect(screen.getByTestId('unlinked-child')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
  })

  it('opens the app for a linked managed child', () => {
    hooks.useSession.mockReturnValue(auth({ session: childSession, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ userId: 'child-1', member: childMember }))
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('opens the app for a linked managed child on cached identity too', () => {
    hooks.useSession.mockReturnValue(auth({ session: childSession, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({
      userId: 'child-1', status: 'cached-validating', member: childMember, resolved: false, validating: true,
    }))
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('returns an expired managed child session to the login screen', () => {
    hooks.useSession.mockReturnValue(auth({ session: childSession, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ userId: 'child-1', member: childMember }))
    const view = render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()

    hooks.useSession.mockReturnValue(auth())
    hooks.useFamily.mockReturnValue(family({ userId: null, status: 'idle', resolved: false }))
    view.rerender(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
  })
})

describe('App auth bootstrap failures', () => {
  it('offers a retry instead of claiming the user is signed out', () => {
    hooks.useSession.mockReturnValue(auth({ session: undefined, status: 'unavailable', authError: 'auth-init-timeout' }))
    render(<App />)
    expect(screen.getByRole('alert').textContent).toBe(t.bootstrap.sessionUnavailable)
    expect(screen.getByRole('button', { name: t.errors.retry })).toBeTruthy()
    // The login form is the one thing this must NOT show — it would invite a
    // re-login into a session the browser may still hold.
    expect(screen.queryByTestId('auth-screen')).toBeNull()
  })

  it('retries the auth bootstrap rather than the membership query', () => {
    hooks.useSession.mockReturnValue(auth({ session: undefined, status: 'unavailable', authError: 'auth-init-timeout' }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: t.errors.retry }))
    expect(retryAuth).toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('still lets the user reach the login form if the check keeps failing', () => {
    hooks.useSession.mockReturnValue(auth({ session: undefined, status: 'unavailable', authError: 'auth-init-timeout' }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: t.bootstrap.continueToSignIn }))
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
  })
})

describe('App cached-identity bootstrap', () => {
  it('opens the shell on a cached identity while the server is still validating', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ status: 'cached-validating', member, resolved: false, validating: true }))
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
    expect(screen.queryByText(t.loading.family)).toBeNull()
  })

  it('never opens a cached identity without a session', () => {
    hooks.useSession.mockReturnValue(auth())
    hooks.useFamily.mockReturnValue(family({ status: 'cached-validating', member, resolved: false, validating: true }))
    render(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('waits rather than showing a cached identity scoped to another user', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({
      userId: 'user-2', status: 'cached-validating', member, resolved: false, validating: true,
    }))
    render(<App />)
    expect(screen.getByText(t.loading.family)).toBeTruthy()
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('remounts the data graph when the identity scope changes', () => {
    // The provider tree is keyed by userId:familyId, so an account or family
    // switch cannot reuse state populated for the previous scope — that state
    // is exactly what a "user B sees user A's family" flash would come from.
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ member }))
    const view = render(<App />)

    const otherSession = { user: { id: 'user-2', email: 'b@example.com', app_metadata: {}, user_metadata: {} } } as Session
    const otherMember = makeFamilyMember({ id: 'member-2', user_id: 'user-2', family_id: 'family-2' })
    hooks.useSession.mockReturnValue(auth({ session: otherSession, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ userId: 'user-2', member: otherMember }))
    view.rerender(<App />)

    expect(providerMounts).toEqual(['user-1:family-1', 'user-2:family-2'])
  })

  it('does not remount the data graph on an unrelated re-render', () => {
    hooks.useSession.mockReturnValue(auth({ session, status: 'authenticated' }))
    hooks.useFamily.mockReturnValue(family({ status: 'cached-validating', member, resolved: false, validating: true }))
    const view = render(<App />)

    // Cached identity confirmed by the server: same scope, so provider state
    // (and every in-flight fetch it owns) must survive.
    hooks.useFamily.mockReturnValue(family({ member }))
    view.rerender(<App />)

    expect(providerMounts).toEqual(['user-1:family-1'])
  })
})

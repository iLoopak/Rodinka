// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFamilyMember } from './utils/testFixtures'
import { t } from './strings'

const hooks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useFamily: vi.fn(),
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
vi.mock('./context/AppDataProviders', () => ({ AppDataProviders: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/ReminderContext', () => ({ ReminderProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/PushContext', () => ({ PushProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/create-record/CreateRecordContext', () => ({ CreateRecordProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/calendar/CalendarOfflineContext', () => ({ useCalendarOffline: () => ({ calendarHasUsableData: false }) }))

import App from './App'

const session = {
  user: { id: 'user-1', email: 'parent@example.com', app_metadata: {}, user_metadata: {} },
} as Session
const member = makeFamilyMember({ id: 'member-1', user_id: 'user-1', family_id: 'family-1' })
const refresh = vi.fn()

function family(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    status: 'resolved',
    member: null,
    loading: false,
    resolved: true,
    refresh,
    connectionError: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
  hooks.useSession.mockReturnValue({ session: null, loading: false })
  hooks.useFamily.mockReturnValue(family({ userId: null, status: 'idle', resolved: false }))
})

afterEach(cleanup)

describe('App authentication routing', () => {
  it('shows only splash while Supabase auth is unresolved', () => {
    hooks.useSession.mockReturnValue({ session: undefined, loading: true })
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
    hooks.useSession.mockReturnValue({ session, loading: false })
    hooks.useFamily.mockReturnValue(family({ status: 'loading', resolved: false }))
    render(<App />)
    expect(screen.getByText(t.loading.family)).toBeTruthy()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
  })

  it('shows onboarding only for an authenticated, resolved user without a family', () => {
    hooks.useSession.mockReturnValue({ session, loading: false })
    hooks.useFamily.mockReturnValue(family())
    render(<App />)
    expect(screen.getByTestId('onboarding-screen')).toBeTruthy()
    expect(screen.queryByTestId('auth-screen')).toBeNull()
  })

  it('opens the app for an authenticated family member', () => {
    hooks.useSession.mockReturnValue({ session, loading: false })
    hooks.useFamily.mockReturnValue(family({ member }))
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('moves from registration auth to onboarding only after a session exists', () => {
    const view = render(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()

    hooks.useSession.mockReturnValue({ session, loading: false })
    hooks.useFamily.mockReturnValue(family())
    view.rerender(<App />)
    expect(screen.getByTestId('onboarding-screen')).toBeTruthy()
  })

  it('returns directly to auth after sign-out even if old family data still exists', () => {
    hooks.useSession.mockReturnValue({ session, loading: false })
    hooks.useFamily.mockReturnValue(family({ member }))
    const view = render(<App />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()

    hooks.useSession.mockReturnValue({ session: null, loading: false })
    view.rerender(<App />)
    expect(screen.getByTestId('auth-screen')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
  })

  it('uses the fallback instead of onboarding after a failed membership request', () => {
    hooks.useSession.mockReturnValue({ session, loading: false })
    hooks.useFamily.mockReturnValue(family({ status: 'error', resolved: false, connectionError: 'network unavailable' }))
    render(<App />)
    expect(screen.getByTestId('offline-fallback')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-screen')).toBeNull()
  })
})

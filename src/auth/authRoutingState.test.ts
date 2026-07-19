import type { Session } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { makeFamilyMember } from '../utils/testFixtures'
import { resolveAuthRoutingState } from './authRoutingState'

const session = {
  user: { id: 'user-1', email: 'parent@example.com', app_metadata: {}, user_metadata: {} },
} as Session
const member = makeFamilyMember({ id: 'member-1', user_id: 'user-1', family_id: 'family-1' })

function family(overrides: Partial<Parameters<typeof resolveAuthRoutingState>[0]['family']> = {}) {
  return {
    userId: 'user-1',
    status: 'resolved' as const,
    member: null,
    connectionError: null,
    ...overrides,
  }
}

describe('auth routing state', () => {
  it('keeps auth loading separate from a confirmed anonymous session', () => {
    expect(resolveAuthRoutingState({ session: undefined, family: family() }).status).toBe('authLoading')
    expect(resolveAuthRoutingState({ session: null, family: family({ member }) }).status).toBe('unauthenticated')
  })

  it('never lets cached family data override an anonymous or expired session', () => {
    const state = resolveAuthRoutingState({ session: null, family: family({ member }) })
    expect(state.status).toBe('unauthenticated')
  })

  it.each([
    family({ status: 'idle' }),
    family({ status: 'loading' }),
    family({ userId: 'another-user', member }),
  ])('waits while membership is unresolved or belongs to another user', (snapshot) => {
    expect(resolveAuthRoutingState({ session, family: snapshot }).status).toBe('userDataLoading')
  })

  it('shows onboarding only after a successful empty membership lookup', () => {
    expect(resolveAuthRoutingState({ session, family: family() }).status).toBe('authenticatedWithoutFamily')
  })

  it('opens the app for a verified family member', () => {
    const state = resolveAuthRoutingState({ session, family: family({ member }) })
    expect(state.status).toBe('authenticatedWithFamily')
  })

  it('shows an error state rather than onboarding when membership loading fails', () => {
    const state = resolveAuthRoutingState({
      session,
      family: family({ status: 'error', connectionError: 'network unavailable' }),
    })
    expect(state.status).toBe('userDataError')
  })

  it('can open the offline app only with cache scoped to the current user', () => {
    const state = resolveAuthRoutingState({
      session,
      family: family({ member, connectionError: 'network unavailable' }),
    })
    expect(state.status).toBe('authenticatedWithFamily')
  })
})

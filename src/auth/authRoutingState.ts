import type { Session } from '@supabase/supabase-js'
import type { Member, FamilyMembershipStatus } from '../hooks/useFamily'

interface FamilyRoutingSnapshot {
  userId: string | null
  status: FamilyMembershipStatus
  member: Member | null
  connectionError: string | null
}

interface AuthRoutingInput {
  session: Session | null | undefined
  family: FamilyRoutingSnapshot
}

export type AuthRoutingState =
  | { status: 'authLoading' }
  | { status: 'unauthenticated' }
  | { status: 'userDataLoading'; session: Session }
  | { status: 'userDataError'; session: Session; connectionError: string }
  | { status: 'authenticatedWithoutFamily'; session: Session }
  | { status: 'authenticatedWithFamily'; session: Session; member: Member; connectionError: string | null }

export function resolveAuthRoutingState({ session, family }: AuthRoutingInput): AuthRoutingState {
  if (session === undefined) return { status: 'authLoading' }
  if (session === null) return { status: 'unauthenticated' }

  if (family.userId !== session.user.id || family.status === 'idle' || family.status === 'loading') {
    return { status: 'userDataLoading', session }
  }

  // A cached, user-scoped family identity is enough to open the offline app
  // after the live lookup fails. It must never be reused for another user.
  if (family.member) {
    return {
      status: 'authenticatedWithFamily',
      session,
      member: family.member,
      connectionError: family.connectionError,
    }
  }

  if (family.status === 'error') {
    return {
      status: 'userDataError',
      session,
      connectionError: family.connectionError ?? 'family-membership-unavailable',
    }
  }

  return { status: 'authenticatedWithoutFamily', session }
}

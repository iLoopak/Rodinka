import type { Session } from '@supabase/supabase-js'
import type { Member, FamilyMembershipStatus } from '../hooks/useFamily'
import type { AuthSessionStatus } from '../hooks/useSession'

interface FamilyRoutingSnapshot {
  userId: string | null
  status: FamilyMembershipStatus
  member: Member | null
  connectionError: string | null
  dataError?: string | null
}

interface AuthRoutingInput {
  session: Session | null | undefined
  /** Omitted by older callers/tests — derived from `session` when absent. */
  authStatus?: AuthSessionStatus
  authError?: string | null
  family: FamilyRoutingSnapshot
}

export type AuthRoutingState =
  | { status: 'authLoading' }
  | { status: 'authError'; authError: string }
  | { status: 'unauthenticated' }
  | { status: 'userDataLoading'; session: Session }
  | { status: 'userDataError'; session: Session; connectionError: string }
  | { status: 'authenticatedWithoutFamily'; session: Session }
  /** Cached identity is usable now; the server answer is still in flight. */
  | { status: 'cachedFamilyValidating'; session: Session; member: Member }
  | { status: 'authenticatedWithFamily'; session: Session; member: Member; connectionError: string | null }

function deriveAuthStatus(session: Session | null | undefined): AuthSessionStatus {
  if (session === undefined) return 'loading'
  return session === null ? 'anonymous' : 'authenticated'
}

export function resolveAuthRoutingState({ session, authStatus, authError, family }: AuthRoutingInput): AuthRoutingState {
  const auth = authStatus ?? deriveAuthStatus(session)

  if (auth === 'loading') return { status: 'authLoading' }
  // "We could not ask" is not "you are signed out". Showing the login screen
  // here would invite the user to re-authenticate a session they may still
  // hold; a retryable error keeps the truth visible instead.
  if (auth === 'unavailable') return { status: 'authError', authError: authError ?? 'auth-unavailable' }
  if (session === null || session === undefined) return { status: 'unauthenticated' }

  if (family.userId !== session.user.id || family.status === 'idle' || family.status === 'loading') {
    return { status: 'userDataLoading', session }
  }

  // A cached, user-scoped family identity is enough to open the app while the
  // server answer is still on its way. It must never be reused for another
  // user — the guards above (session present, matching userId) are what make
  // that true, and the membership result replaces it wholesale.
  if (family.status === 'cached-validating' && family.member) {
    return { status: 'cachedFamilyValidating', session, member: family.member }
  }

  // A cached identity also carries the offline app after the live lookup
  // fails with a genuine network outage.
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

import type { User } from '@supabase/supabase-js'
import { t } from '../strings'
import { internalEmailToChildLoginName } from './childAccountIdentity'

// Same shape as the sign-in form uses, kept deliberately permissive: the real
// validation is Supabase's, this only catches obvious typos before we spend a
// round-trip (and an email-send rate-limit slot) on them.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export type EmailChangeValidation =
  | { ok: true; email: string }
  | { ok: false; message: string }

interface EmailChangeInput {
  currentEmail: string
  newEmail: string
  confirmEmail: string
}

// Order matters: report the problem the user can act on first, so an empty
// second field never gets reported as "addresses do not match".
export function validateEmailChange({ currentEmail, newEmail, confirmEmail }: EmailChangeInput): EmailChangeValidation {
  const email = normalizeEmail(newEmail)
  const confirmation = normalizeEmail(confirmEmail)

  if (!email || !confirmation) return { ok: false, message: t.more.changeEmailErrors.required }
  if (!EMAIL_RE.test(email)) return { ok: false, message: t.more.changeEmailErrors.invalidEmail }
  if (email !== confirmation) return { ok: false, message: t.more.changeEmailErrors.mismatch }
  if (email === normalizeEmail(currentEmail)) return { ok: false, message: t.more.changeEmailErrors.sameAsCurrent }

  return { ok: true, email }
}

interface AuthErrorLike {
  message?: string
  code?: string
  status?: number
}

// Supabase returns English, sometimes internal-sounding text ("A user with
// this email address has already been registered"). Map the cases a user can
// actually hit while changing their address; everything else collapses to one
// safe sentence so no raw provider text reaches the UI.
export function translateEmailChangeError(error: AuthErrorLike | null | undefined): string {
  const code = error?.code?.toLowerCase() ?? ''
  const message = error?.message?.toLowerCase() ?? ''

  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    message.includes('already been registered') ||
    message.includes('already registered') ||
    message.includes('already exists')
  ) {
    return t.more.changeEmailErrors.emailTaken
  }

  if (
    code === 'email_address_invalid' ||
    code === 'validation_failed' ||
    message.includes('invalid email') ||
    message.includes('unable to validate email')
  ) {
    return t.more.changeEmailErrors.invalidEmail
  }

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    error?.status === 429 ||
    message.includes('rate limit') ||
    message.includes('security purposes')
  ) {
    return t.more.changeEmailErrors.tooManyRequests
  }

  if (
    code === 'session_not_found' ||
    code === 'refresh_token_not_found' ||
    code === 'bad_jwt' ||
    error?.status === 401 ||
    message.includes('auth session missing') ||
    message.includes('jwt expired') ||
    message.includes('invalid claim')
  ) {
    return t.more.changeEmailErrors.sessionExpired
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed')
  ) {
    return t.more.changeEmailErrors.network
  }

  // Only the message, only in development: never the user object, session or
  // any token that a Supabase error may be carrying alongside it.
  if (import.meta.env.DEV) console.error('Email change failed:', error?.code ?? error?.message)
  return t.more.changeEmailErrors.generic
}

export interface AuthAccount {
  email: string
  /** False while Supabase still treats the address as unconfirmed. */
  emailVerified: boolean
  /** Address awaiting confirmation, or null when no change is in flight. */
  pendingEmail: string | null
  /** A Google identity is linked, so the copy must not imply we touch that account. */
  hasGoogleIdentity: boolean
  /** Managed child logins are synthetic identifiers, not real mailboxes. */
  isManagedChildLogin: boolean
  /** Only a real, non-managed mailbox may be changed from the account settings. */
  canChangeEmail: boolean
}

interface UserLike {
  email?: string | null
  new_email?: string | null
  email_confirmed_at?: string | null
  confirmed_at?: string | null
  identities?: { provider?: string }[] | null
}

// Derives everything the account UI needs from the auth user alone, so the
// screen never has to guess from a profile row. Supabase exposes the address
// awaiting confirmation as `new_email`, which is how we can show a truthful
// "pending" state instead of optimistically showing the new address.
export function describeAuthAccount(user: (User | UserLike) | null | undefined): AuthAccount {
  const source = (user ?? {}) as UserLike
  const email = source.email ?? ''
  const pendingEmail = source.new_email ? normalizeEmail(source.new_email) : null
  const isManagedChildLogin = internalEmailToChildLoginName(email) !== null
  const hasGoogleIdentity = (source.identities ?? []).some((identity) => identity?.provider === 'google')

  return {
    email,
    emailVerified: Boolean(source.email_confirmed_at ?? source.confirmed_at),
    pendingEmail,
    hasGoogleIdentity,
    isManagedChildLogin,
    canChangeEmail: Boolean(email) && !isManagedChildLogin,
  }
}

export interface EmailChangeOutcome {
  /** 'pending' — Supabase mailed a confirmation link and the old address still signs in.
   *  'applied' — the project has email confirmation off, so the change is already live. */
  kind: 'pending' | 'applied'
  email: string
}

// Decided from the user Supabase returns, never assumed: which of the two
// happens depends on the project's "Confirm email" setting, and claiming a
// confirmation email was sent when it wasn't would leave the user waiting for
// a link that never arrives. Anything ambiguous falls back to 'pending', the
// conservative message ("go check your mail") rather than a false all-clear.
export function describeUpdateOutcome(
  user: (User | UserLike) | null | undefined,
  requestedEmail: string
): EmailChangeOutcome {
  const account = describeAuthAccount(user)
  const applied = !account.pendingEmail && normalizeEmail(account.email) === normalizeEmail(requestedEmail)
  return { kind: applied ? 'applied' : 'pending', email: normalizeEmail(requestedEmail) }
}

interface RedirectLocation {
  origin: string
}

// The confirmation link has to land on a route that actually exists in the
// app. Account settings live on /more (there is no /settings/account here),
// and deriving the origin keeps localhost, previews and production working
// from the same code — each origin just needs to be allow-listed in Supabase.
export function getEmailChangeRedirectUrl(location: RedirectLocation = window.location): string {
  return `${location.origin}/more`
}

// Supabase strips the auth fragment from the URL as soon as it has consumed
// it, so the caller snapshots the URL at module load and asks this afterwards.
export function isEmailChangeReturn(url: string): boolean {
  const [, hash = ''] = url.split('#')
  const [, query = ''] = url.split('?')
  return /(?:^|[?&#])type=email_change(?:&|$)/.test(hash) || /(?:^|[?&#])type=email_change(?:&|$)/.test(query)
}

// Captured during module evaluation, which is synchronous and therefore always
// runs before supabase-js has finished consuming (and clearing) the fragment
// it was handed. Reading window.location later would see an already-cleaned URL.
const initialUrl = typeof window === 'undefined' ? '' : window.location.href

export function landedFromEmailChangeConfirmation(): boolean {
  return isEmailChangeReturn(initialUrl)
}

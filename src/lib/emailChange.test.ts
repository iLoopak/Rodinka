import { describe, expect, it, vi } from 'vitest'
import { t } from '../strings'
import {
  describeAuthAccount,
  describeUpdateOutcome,
  getEmailChangeRedirectUrl,
  isEmailChangeReturn,
  normalizeEmail,
  translateEmailChangeError,
  validateEmailChange,
} from './emailChange'

const current = 'rodic@example.com'

describe('email change validation', () => {
  it('accepts a valid, different address and normalizes it', () => {
    const result = validateEmailChange({
      currentEmail: current,
      newEmail: '  Novy.Rodic@Example.COM ',
      confirmEmail: 'novy.rodic@example.com',
    })
    expect(result).toEqual({ ok: true, email: 'novy.rodic@example.com' })
  })

  it('requires both fields before anything else', () => {
    expect(validateEmailChange({ currentEmail: current, newEmail: '', confirmEmail: '' }))
      .toEqual({ ok: false, message: t.more.changeEmailErrors.required })
    // An empty confirmation must not be reported as a mismatch.
    expect(validateEmailChange({ currentEmail: current, newEmail: 'novy@example.com', confirmEmail: '' }))
      .toEqual({ ok: false, message: t.more.changeEmailErrors.required })
  })

  it('rejects an invalid email format', () => {
    expect(validateEmailChange({ currentEmail: current, newEmail: 'neplatny', confirmEmail: 'neplatny' }))
      .toEqual({ ok: false, message: t.more.changeEmailErrors.invalidEmail })
  })

  it('rejects a confirmation that does not match', () => {
    expect(validateEmailChange({ currentEmail: current, newEmail: 'a@example.com', confirmEmail: 'b@example.com' }))
      .toEqual({ ok: false, message: t.more.changeEmailErrors.mismatch })
  })

  it('rejects the address the account already uses, ignoring case and spacing', () => {
    expect(validateEmailChange({ currentEmail: current, newEmail: ' RODIC@example.com ', confirmEmail: 'rodic@example.com' }))
      .toEqual({ ok: false, message: t.more.changeEmailErrors.sameAsCurrent })
  })

  it('normalizes addresses consistently', () => {
    expect(normalizeEmail('  Mail@Example.COM ')).toBe('mail@example.com')
  })
})

describe('email change error translation', () => {
  it('maps an address already used by another account', () => {
    expect(translateEmailChangeError({ code: 'email_exists' })).toBe(t.more.changeEmailErrors.emailTaken)
    expect(translateEmailChangeError({ message: 'A user with this email address has already been registered' }))
      .toBe(t.more.changeEmailErrors.emailTaken)
  })

  it('maps an invalid address', () => {
    expect(translateEmailChangeError({ code: 'email_address_invalid' })).toBe(t.more.changeEmailErrors.invalidEmail)
    expect(translateEmailChangeError({ message: 'Unable to validate email address: invalid format' }))
      .toBe(t.more.changeEmailErrors.invalidEmail)
  })

  it('maps rate limiting', () => {
    expect(translateEmailChangeError({ code: 'over_email_send_rate_limit' })).toBe(t.more.changeEmailErrors.tooManyRequests)
    expect(translateEmailChangeError({ status: 429, message: 'Too many requests' })).toBe(t.more.changeEmailErrors.tooManyRequests)
    expect(translateEmailChangeError({ message: 'For security purposes, you can only request this after 51 seconds' }))
      .toBe(t.more.changeEmailErrors.tooManyRequests)
  })

  it('maps an expired or missing session', () => {
    expect(translateEmailChangeError({ message: 'Auth session missing!' })).toBe(t.more.changeEmailErrors.sessionExpired)
    expect(translateEmailChangeError({ code: 'session_not_found' })).toBe(t.more.changeEmailErrors.sessionExpired)
    expect(translateEmailChangeError({ status: 401, message: 'JWT expired' })).toBe(t.more.changeEmailErrors.sessionExpired)
  })

  it('maps a network failure', () => {
    expect(translateEmailChangeError({ message: 'Failed to fetch' })).toBe(t.more.changeEmailErrors.network)
  })

  it('falls back to one safe message and never leaks raw Supabase text', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = 'pq: duplicate key value violates unique constraint "users_email_partial_key"'
    const message = translateEmailChangeError({ message: raw, code: 'unexpected_failure' })
    expect(message).toBe(t.more.changeEmailErrors.generic)
    expect(message).not.toContain('constraint')
    // Technical detail stays in the development log only, and only the code or
    // message — never a user object, session or token.
    for (const call of logged.mock.calls) expect(call.join(' ')).not.toContain('access_token')
    logged.mockRestore()
  })
})

describe('auth account description', () => {
  it('describes a confirmed email/password user', () => {
    const account = describeAuthAccount({
      email: 'rodic@example.com',
      email_confirmed_at: '2026-07-01T10:00:00Z',
      identities: [{ provider: 'email' }],
    })
    expect(account.email).toBe('rodic@example.com')
    expect(account.emailVerified).toBe(true)
    expect(account.pendingEmail).toBeNull()
    expect(account.hasGoogleIdentity).toBe(false)
    expect(account.canChangeEmail).toBe(true)
  })

  it('describes a Google user as changeable, since only the Rodinka login email moves', () => {
    const account = describeAuthAccount({
      email: 'rodic@gmail.com',
      email_confirmed_at: '2026-07-01T10:00:00Z',
      identities: [{ provider: 'google' }],
    })
    expect(account.hasGoogleIdentity).toBe(true)
    expect(account.canChangeEmail).toBe(true)
  })

  it('surfaces the address awaiting confirmation instead of pretending it is done', () => {
    const account = describeAuthAccount({
      email: 'stary@example.com',
      new_email: 'Novy@Example.com',
      email_confirmed_at: '2026-07-01T10:00:00Z',
    })
    // The active address is still the old one until the link is confirmed.
    expect(account.email).toBe('stary@example.com')
    expect(account.pendingEmail).toBe('novy@example.com')
  })

  it('reports an unverified address', () => {
    expect(describeAuthAccount({ email: 'rodic@example.com' }).emailVerified).toBe(false)
  })

  it('never offers an email change for a managed child login', () => {
    const account = describeAuthAccount({ email: 'child.zofka-7@children.rodinka.invalid' })
    expect(account.isManagedChildLogin).toBe(true)
    expect(account.canChangeEmail).toBe(false)
  })

  it('degrades safely with no user', () => {
    const account = describeAuthAccount(null)
    expect(account.email).toBe('')
    expect(account.canChangeEmail).toBe(false)
  })
})

describe('update outcome', () => {
  it('reports a pending confirmation when Supabase parks the address', () => {
    const outcome = describeUpdateOutcome(
      { email: 'stary@example.com', new_email: 'novy@example.com' },
      'novy@example.com'
    )
    expect(outcome).toEqual({ kind: 'pending', email: 'novy@example.com' })
  })

  it('reports the change as applied when the project has email confirmation off', () => {
    // With "Confirm email" disabled, Supabase returns the already-updated user
    // and never sends a link — promising one would leave the user waiting.
    const outcome = describeUpdateOutcome({ email: 'novy@example.com' }, 'novy@example.com')
    expect(outcome).toEqual({ kind: 'applied', email: 'novy@example.com' })
  })

  it('falls back to the conservative pending message when the response is unusable', () => {
    expect(describeUpdateOutcome(null, 'novy@example.com').kind).toBe('pending')
    expect(describeUpdateOutcome(undefined, 'novy@example.com').kind).toBe('pending')
  })
})

describe('confirmation redirect', () => {
  it('points back at the account settings route of the current origin', () => {
    expect(getEmailChangeRedirectUrl({ origin: 'http://localhost:5173' })).toBe('http://localhost:5173/more')
    expect(getEmailChangeRedirectUrl({ origin: 'https://rodinka.app' })).toBe('https://rodinka.app/more')
  })

  it('recognizes a return from the confirmation link', () => {
    expect(isEmailChangeReturn('https://rodinka.app/more#access_token=abc&type=email_change')).toBe(true)
    expect(isEmailChangeReturn('https://rodinka.app/more?type=email_change')).toBe(true)
    expect(isEmailChangeReturn('https://rodinka.app/more#type=email_change&expires_in=3600')).toBe(true)
  })

  it('does not mistake an ordinary visit or another auth flow for a confirmation', () => {
    expect(isEmailChangeReturn('https://rodinka.app/more')).toBe(false)
    expect(isEmailChangeReturn('https://rodinka.app/more#access_token=abc&type=recovery')).toBe(false)
    expect(isEmailChangeReturn('https://rodinka.app/more#type=signup')).toBe(false)
  })
})

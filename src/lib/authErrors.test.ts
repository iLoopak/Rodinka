import { describe, expect, it, vi } from 'vitest'
import { t } from '../strings'
import { translateAuthError } from './authErrors'

describe('translateAuthError', () => {
  it('maps invalid credentials by code and by message', () => {
    expect(translateAuthError({ code: 'invalid_credentials' })).toBe(t.login.errors.invalidCredentials)
    expect(translateAuthError({ message: 'Invalid login credentials' })).toBe(t.login.errors.invalidCredentials)
  })

  it('maps an existing account by code and by common messages', () => {
    expect(translateAuthError({ code: 'user_already_exists' })).toBe(t.login.errors.userAlreadyExists)
    expect(translateAuthError({ message: 'User already registered' })).toBe(t.login.errors.userAlreadyExists)
    expect(translateAuthError({ message: 'A user with this email already exists' })).toBe(t.login.errors.userAlreadyExists)
  })

  it('maps a weak password by code and by the "at least" phrasing', () => {
    expect(translateAuthError({ code: 'weak_password' })).toBe(t.login.errors.passwordTooShort)
    expect(translateAuthError({ message: 'Password should be at least 8 characters' })).toBe(t.login.errors.passwordTooShort)
    // "password" without "least" must not be treated as a length problem.
    expect(translateAuthError({ message: 'password is required' })).not.toBe(t.login.errors.passwordTooShort)
  })

  it('maps every rate-limit variant', () => {
    expect(translateAuthError({ code: 'over_email_send_rate_limit' })).toBe(t.login.errors.tooManyRequests)
    expect(translateAuthError({ code: 'over_request_rate_limit' })).toBe(t.login.errors.tooManyRequests)
    expect(translateAuthError({ message: 'Email rate limit exceeded' })).toBe(t.login.errors.tooManyRequests)
  })

  it('maps an invalid email only when validation failed and the message mentions email', () => {
    expect(translateAuthError({ code: 'validation_failed', message: 'Unable to validate email address' }))
      .toBe(t.login.errors.invalidEmail)
    // validation_failed about something other than email is not an email error.
    expect(translateAuthError({ code: 'validation_failed', message: 'phone number is invalid' }))
      .not.toBe(t.login.errors.invalidEmail)
  })

  it('is case-insensitive across codes and messages', () => {
    expect(translateAuthError({ code: 'INVALID_CREDENTIALS' })).toBe(t.login.errors.invalidCredentials)
    expect(translateAuthError({ message: 'INVALID LOGIN CREDENTIALS' })).toBe(t.login.errors.invalidCredentials)
  })

  it('falls back to the generic message and logs the raw text for anything unrecognized', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = 'pq: duplicate key value violates unique constraint "users_pkey"'
    expect(translateAuthError({ message: raw, code: 'unexpected_failure' })).toBe(t.errors.generic)
    expect(logged).toHaveBeenCalledWith('Supabase auth error:', raw)
    logged.mockRestore()
  })

  it('degrades safely with null or empty input', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(translateAuthError(null)).toBe(t.errors.generic)
    expect(translateAuthError(undefined)).toBe(t.errors.generic)
    expect(translateAuthError({})).toBe(t.errors.generic)
    logged.mockRestore()
  })
})

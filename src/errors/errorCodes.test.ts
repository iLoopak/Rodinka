import { describe, expect, it } from 'vitest'
import { classifyAppError, deniesCachedData, isRetryableErrorCode } from './errorCodes'

describe('error taxonomy', () => {
  it('separates a permission error from a connectivity error even while offline', () => {
    // This is the rule that keeps a user who lost family access from being
    // handed that family's cached data through an offline fallback path.
    const error = { code: '42501', message: 'new row violates row-level security policy' }
    expect(classifyAppError(error, { browserOnline: false })).toBe('permission-denied')
    expect(deniesCachedData('permission-denied')).toBe(true)
    expect(isRetryableErrorCode('permission-denied')).toBe(false)
  })

  it('classifies an expired session as auth, not as an outage', () => {
    expect(classifyAppError(new Error('JWT expired'))).toBe('auth-expired')
    expect(deniesCachedData('auth-expired')).toBe(true)
  })

  it('calls a transport failure offline only when the browser is offline', () => {
    const error = new TypeError('Failed to fetch')
    expect(classifyAppError(error, { browserOnline: false })).toBe('network-offline')
    // Same failure, live radio: the backend is unreachable, the device is not
    // offline. Reporting this as offline is the false-offline bug.
    expect(classifyAppError(error, { browserOnline: true })).toBe('backend-unavailable')
  })

  it('reads Postgrest error objects, not just Error instances', () => {
    // PostgrestError is a plain object; `instanceof Error` misses it entirely.
    expect(classifyAppError({ code: 'PGRST116', message: 'no rows' })).toBe('not-found')
    expect(classifyAppError({ code: '23505', message: 'duplicate key value' })).toBe('conflict')
    expect(classifyAppError({ code: 'P0001', message: 'Shopping item name is required' })).toBe('mutation-failed')
  })

  it('classifies timeouts and aborts as retryable timeouts', () => {
    expect(classifyAppError(new Error('membership load timed out'))).toBe('request-timeout')
    expect(isRetryableErrorCode('request-timeout')).toBe(true)
  })

  it('classifies a full quota as a storage problem, not a network one', () => {
    const quota = Object.assign(new Error('exceeded the quota'), { name: 'QuotaExceededError' })
    expect(classifyAppError(quota)).toBe('storage-quota')
    expect(isRetryableErrorCode('storage-quota')).toBe(false)
  })

  it('falls back to unknown rather than guessing', () => {
    expect(classifyAppError(new Error('something odd happened'))).toBe('unknown')
  })
})

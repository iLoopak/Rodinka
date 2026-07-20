import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isNetworkUnavailableError } from './networkStatus'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

beforeEach(() => setOnline(true))
afterEach(() => setOnline(true))

describe('isNetworkUnavailableError', () => {
  it('reads the message off a PostgrestError, which is a plain object', () => {
    // Regression pin: this used to stringify to "[object Object]", so every
    // message rule below was dead for database errors and the offline
    // fallback only worked when navigator.onLine already said offline.
    expect(isNetworkUnavailableError({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isNetworkUnavailableError({ message: 'NetworkError when attempting to fetch' })).toBe(true)
  })

  it('still reads Error subclasses such as AuthError', () => {
    expect(isNetworkUnavailableError(new Error('Failed to fetch'))).toBe(true)
  })

  it('never calls an authorization answer a network outage', () => {
    for (const message of [
      'permission denied for table members',
      'JWT expired',
      'new row violates row level security policy',
      'Invalid refresh token',
      'Bad Request',
      'request failed with status 403',
    ]) {
      expect(isNetworkUnavailableError({ message })).toBe(false)
    }
  })

  it('treats anything as an outage while the browser reports offline', () => {
    setOnline(false)
    expect(isNetworkUnavailableError({ message: 'permission denied' })).toBe(true)
  })

  it('does not mistake a deliberate abort for an outage', () => {
    expect(isNetworkUnavailableError(new DOMException('cancelled', 'AbortError'))).toBe(false)
  })
})

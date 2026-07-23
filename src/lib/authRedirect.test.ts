import { describe, expect, it, vi } from 'vitest'

describe('getAuthRedirectUrl', () => {
  it('preserves a deep link through an OAuth round trip on the web', async () => {
    vi.resetModules()
    vi.doMock('../platform/capacitor', () => ({ isNativeApp: () => false }))
    const { getAuthRedirectUrl } = await import('./authRedirect')
    expect(getAuthRedirectUrl({
      origin: 'https://rodinka.example',
      pathname: '/chores',
      search: '?chore=123e4567-e89b-42d3-a456-426614174000',
      hash: '',
    })).toBe('https://rodinka.example/chores?chore=123e4567-e89b-42d3-a456-426614174000')
  })

  it('returns the fixed native callback scheme inside the Capacitor shell', async () => {
    vi.resetModules()
    vi.doMock('../platform/capacitor', () => ({ isNativeApp: () => true }))
    const { getAuthRedirectUrl, NATIVE_AUTH_CALLBACK_URL } = await import('./authRedirect')
    expect(getAuthRedirectUrl({
      origin: 'https://rodinka.example',
      pathname: '/chores',
      search: '?chore=123e4567-e89b-42d3-a456-426614174000',
      hash: '',
    })).toBe(NATIVE_AUTH_CALLBACK_URL)
    expect(NATIVE_AUTH_CALLBACK_URL).toBe('cz.rodinka.app://auth/callback')
  })
})

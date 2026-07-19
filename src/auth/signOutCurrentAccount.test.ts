// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  releasePush: vi.fn(),
  saveFamilyIdentity: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../push/pushClient', () => ({ releasePushOnSignOut: mocks.releasePush }))
vi.mock('../shopping/shoppingIndexedDb', () => ({
  getShoppingLocalStore: () => ({ saveFamilyIdentity: mocks.saveFamilyIdentity }),
}))
vi.mock('../supabaseClient', () => ({ supabase: { auth: { signOut: mocks.signOut } } }))

import { signOutCurrentAccount } from './signOutCurrentAccount'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.releasePush.mockResolvedValue(undefined)
  mocks.saveFamilyIdentity.mockResolvedValue(undefined)
  mocks.signOut.mockResolvedValue({ error: null })
  window.history.replaceState(null, '', '/more')
})

describe('signOutCurrentAccount', () => {
  it('clears only the current account identity and returns to the auth root', async () => {
    const clearCalendarAccount = vi.fn().mockResolvedValue(undefined)
    await signOutCurrentAccount({ userId: 'user-1', clearCalendarAccount })

    expect(clearCalendarAccount).toHaveBeenCalledOnce()
    expect(mocks.saveFamilyIdentity).toHaveBeenCalledWith('user-1', null)
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/')
  })

  it('still signs out when optional local cache cleanup fails', async () => {
    mocks.saveFamilyIdentity.mockRejectedValue(new Error('IndexedDB unavailable'))
    await signOutCurrentAccount({ userId: 'user-1', clearCalendarAccount: vi.fn().mockResolvedValue(undefined) })
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/')
  })
})

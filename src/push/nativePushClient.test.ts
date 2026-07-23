import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const functionsInvoke = vi.hoisted(() => vi.fn())
vi.mock('../supabaseClient', () => ({ supabase: { rpc, from, functions: { invoke: functionsInvoke } } }))
vi.mock('../platform/capacitor', () => ({ getNativePlatform: () => 'android' }))
vi.mock('../platform/nativeDeepLinks', () => ({ applyRelativeDeepLink: vi.fn() }))

const push = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  addListener: vi.fn(),
}))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }))

import {
  detectPushCapability,
  enablePushOnCurrentDevice,
  reconcileCurrentSubscription,
  refreshPermissionState,
  releasePushOnSignOut,
  resetNativePushClientForTests,
  unsubscribeCurrentDevice,
} from './nativePushClient'

type RegistrationHandler = (token: { value: string }) => void
type RegistrationErrorHandler = (error: { error: string }) => void

function wireRegistration() {
  let onRegistration: RegistrationHandler = () => undefined
  let onError: RegistrationErrorHandler = () => undefined
  push.addListener.mockImplementation((event: string, handler: (payload: unknown) => void) => {
    if (event === 'registration') onRegistration = handler as RegistrationHandler
    if (event === 'registrationError') onError = handler as RegistrationErrorHandler
    return Promise.resolve({ remove: vi.fn() })
  })
  push.register.mockImplementation(async () => { onRegistration({ value: 'device-token-abc' }) })
  return { fireError: (message: string) => onError({ error: message }) }
}

describe('native push client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNativePushClientForTests()
  })
  afterEach(() => resetNativePushClientForTests())

  it('starts optimistic before any permission check has run', () => {
    expect(detectPushCapability()).toEqual({ code: 'supported', supported: true, permission: 'default' })
  })

  it('reflects a denied permission as blocked', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'denied' })
    await refreshPermissionState()
    expect(detectPushCapability()).toEqual({ code: 'blocked', supported: false, permission: 'denied' })
  })

  it('registers, stores the token, and reports it back as the current device', async () => {
    wireRegistration()
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    push.requestPermissions.mockResolvedValue({ receive: 'granted' })
    rpc.mockResolvedValue({ data: 'token-row-id', error: null })

    const result = await enablePushOnCurrentDevice('family-1')

    expect(result).toEqual({ endpoint: 'device-token-abc' })
    expect(rpc).toHaveBeenCalledWith('register_native_push_token', {
      p_family_id: 'family-1', p_platform: 'android', p_device_token: 'device-token-abc', p_device_name: null,
    })
  })

  it('rejects with a translated error when the OS denies the permission prompt', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    push.requestPermissions.mockResolvedValue({ receive: 'denied' })
    await expect(enablePushOnCurrentDevice('family-1')).rejects.toThrow()
    expect(push.register).not.toHaveBeenCalled()
  })

  it('reconciles to null without prompting when permission was never granted', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    const result = await reconcileCurrentSubscription('family-1')
    expect(result).toBeNull()
    expect(push.register).not.toHaveBeenCalled()
  })

  it('revokes by device token through the RPC', async () => {
    rpc.mockResolvedValue({ error: null })
    await unsubscribeCurrentDevice(null, 'device-token-abc')
    expect(rpc).toHaveBeenCalledWith('revoke_native_push_token_by_device', { p_device_token: 'device-token-abc' })
  })

  it('is a no-op on sign-out release when no token was ever registered', async () => {
    expect(await releasePushOnSignOut()).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('releases the current token on sign-out once registered', async () => {
    wireRegistration()
    push.checkPermissions.mockResolvedValue({ receive: 'granted' })
    rpc.mockResolvedValue({ data: 'token-row-id', error: null })
    await enablePushOnCurrentDevice('family-1')

    rpc.mockResolvedValue({ error: null })
    expect(await releasePushOnSignOut()).toBe(true)
    expect(rpc).toHaveBeenCalledWith('revoke_native_push_token_by_device', { p_device_token: 'device-token-abc' })
  })
})

import { PushNotifications, type ActionPerformed, type Token } from '@capacitor/push-notifications'
import { supabase } from '../supabaseClient'
import { getNativePlatform } from '../platform/capacitor'
import { applyRelativeDeepLink } from '../platform/nativeDeepLinks'
import { t } from '../strings'
import type { PushCapability, PushDevice } from './pushClient'

/**
 * Native counterpart to `src/push/pushClient.ts`, same public shape
 * (`PushCapability`/`PushDevice`, same function names) so `PushContext`
 * only has to pick which module to call, not restructure its own state.
 *
 * Uses `@capacitor/push-notifications` (APNs on iOS, FCM on Android) instead
 * of the Web Push/VAPID path — a device token isn't a push subscription
 * endpoint, but is stored the same way conceptually (see
 * `native_push_tokens` in the matching migration). Actual APNs/FCM delivery
 * from the backend is NOT implemented here — that needs the app owner's own
 * Firebase project and Apple Push key, which this build has no access to;
 * see docs/CAPACITOR_NATIVE_SETUP.md.
 */

let cachedPermission: 'granted' | 'denied' | 'prompt' = 'prompt'
let currentToken: string | null = null

type TokenResolver = { resolve: (token: string) => void; reject: (error: Error) => void }
let pendingResolvers: TokenResolver[] = []
let listenersReady: Promise<void> | null = null

function ensureListeners(): Promise<void> {
  if (listenersReady) return listenersReady
  listenersReady = (async () => {
    await PushNotifications.addListener('registration', (token: Token) => {
      currentToken = token.value
      cachedPermission = 'granted'
      const resolvers = pendingResolvers
      pendingResolvers = []
      resolvers.forEach((resolver) => resolver.resolve(token.value))
    })
    await PushNotifications.addListener('registrationError', (error) => {
      const resolvers = pendingResolvers
      pendingResolvers = []
      const message = typeof error?.error === 'string' ? error.error : 'registration failed'
      resolvers.forEach((resolver) => resolver.reject(new Error(message)))
    })
    // Foreground delivery: the OS already shows nothing automatically while
    // the app is active, so this is where an in-app toast would hook in —
    // no in-app notification UI exists yet, so this is deliberately a no-op
    // rather than a half-built banner.
    await PushNotifications.addListener('pushNotificationReceived', () => undefined)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const deepLink = action.notification.data?.deepLink
      if (typeof deepLink === 'string' && deepLink.startsWith('/')) applyRelativeDeepLink(deepLink)
    })
  })()
  return listenersReady
}

async function requestToken(): Promise<string> {
  await ensureListeners()
  const tokenPromise = new Promise<string>((resolve, reject) => {
    pendingResolvers.push({ resolve, reject })
  })
  await PushNotifications.register()
  return tokenPromise
}

export function detectPushCapability(): PushCapability {
  return {
    code: cachedPermission === 'denied' ? 'blocked' : 'supported',
    supported: cachedPermission !== 'denied',
    permission: cachedPermission === 'granted' ? 'granted' : cachedPermission === 'denied' ? 'denied' : 'default',
  }
}

/** Refreshes the cached permission state; call before reading capability. */
export async function refreshPermissionState(): Promise<void> {
  const status = await PushNotifications.checkPermissions()
  cachedPermission = status.receive === 'granted' ? 'granted' : status.receive === 'denied' ? 'denied' : 'prompt'
}

async function storeToken(familyId: string, token: string) {
  const { error } = await supabase.rpc('register_native_push_token', {
    p_family_id: familyId,
    p_platform: getNativePlatform(),
    p_device_token: token,
    p_device_name: null,
  })
  if (error) throw new Error(t.reminders.deviceStoreFailed)
}

export async function reconcileCurrentSubscription(familyId: string): Promise<{ endpoint: string } | null> {
  await refreshPermissionState()
  if (cachedPermission !== 'granted') return null
  const token = currentToken ?? await requestToken()
  await storeToken(familyId, token)
  return { endpoint: token }
}

export async function enablePushOnCurrentDevice(familyId: string): Promise<{ endpoint: string }> {
  await refreshPermissionState()
  if (cachedPermission === 'prompt') {
    const status = await PushNotifications.requestPermissions()
    cachedPermission = status.receive === 'granted' ? 'granted' : 'denied'
  }
  if (cachedPermission !== 'granted') {
    throw new Error(cachedPermission === 'denied' ? t.reminders.permissionBlocked : t.reminders.permissionMissing)
  }
  const token = await requestToken()
  await storeToken(familyId, token)
  return { endpoint: token }
}

export async function loadPushDevices(currentEndpoint: string | null): Promise<PushDevice[]> {
  const { data, error } = await supabase.from('native_push_tokens')
    .select('id,device_token,device_name,platform,created_at,last_seen_at,revoked_at,disabled_at')
    .order('last_seen_at', { ascending: false })
  if (error) throw new Error(t.reminders.deviceListFailed)
  return (data ?? []).map((row) => ({
    id: row.id, endpoint: row.device_token, deviceName: row.device_name, platform: row.platform, browser: null,
    createdAt: row.created_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at, disabledAt: row.disabled_at,
    current: row.device_token === currentEndpoint,
  }))
}

export async function revokePushDevice(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('revoke_native_push_token', { p_token_id: id })
  if (error || !data) throw new Error(t.reminders.deviceRemoveFailed)
}

export async function unsubscribeCurrentDevice(deviceId: string | null, endpoint: string | null = null): Promise<void> {
  if (deviceId) await revokePushDevice(deviceId)
  else if (endpoint) {
    const { error } = await supabase.rpc('revoke_native_push_token_by_device', { p_device_token: endpoint })
    if (error) throw new Error(t.reminders.deviceRemoveFailed)
  }
}

/** Mirrors `releasePushOnSignOut` in `pushClient.ts` — best-effort, never blocks sign-out. */
export async function releasePushOnSignOut(): Promise<boolean> {
  try {
    if (!currentToken) return false
    const { error } = await supabase.rpc('revoke_native_push_token_by_device', { p_device_token: currentToken })
    return !error
  } catch {
    return false
  }
}

export async function sendTestPush(familyId: string) {
  const { data, error } = await supabase.functions.invoke('send-notification-deliveries', {
    body: { mode: 'test', familyId },
  })
  if (error) throw new Error(t.reminders.testNotificationFailed)
  if (!data?.ok) throw new Error(data?.error ?? t.reminders.testNotificationFailed)
  return data
}

export function resetNativePushClientForTests() {
  cachedPermission = 'prompt'
  currentToken = null
  pendingResolvers = []
  listenersReady = null
}

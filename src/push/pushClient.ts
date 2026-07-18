import { supabase } from '../supabaseClient'
import { t } from '../strings'

export type PushCapabilityCode =
  | 'supported'
  | 'insecure'
  | 'service-worker-unavailable'
  | 'notifications-unavailable'
  | 'push-unavailable'
  | 'ios-install-required'
  | 'missing-vapid-key'
  | 'blocked'

export interface PushCapability {
  code: PushCapabilityCode
  permission: NotificationPermission | 'unavailable'
  supported: boolean
}

export interface PushDevice {
  id: string
  endpoint: string
  deviceName: string | null
  platform: string | null
  browser: string | null
  createdAt: string
  lastSeenAt: string
  revokedAt: string | null
  disabledAt: string | null
  current: boolean
}

export interface NormalizedSubscription {
  endpoint: string
  p256dh: string
  auth: string
  contentEncoding: 'aes128gcm'
}

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? ''

export function isIosDevice(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints) {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function detectPushCapability(input: {
  secure?: boolean
  hostname?: string
  hasServiceWorker?: boolean
  hasNotification?: boolean
  hasPushManager?: boolean
  ios?: boolean
  standalone?: boolean
  vapidKey?: string
  permission?: NotificationPermission
} = {}): PushCapability {
  const secure = input.secure ?? window.isSecureContext
  const hostname = input.hostname ?? window.location.hostname
  const hasServiceWorker = input.hasServiceWorker ?? ('serviceWorker' in navigator)
  const hasNotification = input.hasNotification ?? ('Notification' in window)
  const hasPushManager = input.hasPushManager ?? ('PushManager' in window)
  const ios = input.ios ?? isIosDevice()
  const standalone = input.standalone ?? isStandalone()
  const vapidKey = input.vapidKey ?? VAPID_PUBLIC_KEY
  const permission = input.permission ?? (hasNotification ? Notification.permission : 'default')
  const result = (code: PushCapabilityCode, supported = false): PushCapability => ({ code, supported, permission: hasNotification ? permission : 'unavailable' })
  if (!secure && hostname !== 'localhost' && hostname !== '127.0.0.1') return result('insecure')
  if (!hasServiceWorker) return result('service-worker-unavailable')
  if (!hasNotification) return result('notifications-unavailable')
  if (!hasPushManager) return result('push-unavailable')
  if (ios && !standalone) return result('ios-install-required')
  if (!vapidKey) return result('missing-vapid-key')
  if (permission === 'denied') return result('blocked')
  return result('supported', true)
}

export function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function normalizeSubscription(subscription: PushSubscription): NormalizedSubscription {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error(t.reminders.subscriptionInvalid)
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, contentEncoding: 'aes128gcm' }
}

export function describeDevice(userAgent = navigator.userAgent) {
  const platform = isIosDevice(userAgent) ? (/iPad/.test(userAgent) ? 'iPadOS' : 'iOS')
    : /Android/.test(userAgent) ? 'Android'
      : /Windows/.test(userAgent) ? 'Windows'
        : /Macintosh/.test(userAgent) ? 'macOS'
          : /Linux/.test(userAgent) ? 'Linux' : t.reminders.deviceGeneric
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /CriOS|Chrome\//.test(userAgent) ? 'Chrome'
    : /FxiOS|Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : t.reminders.browserGeneric
  return { deviceName: `${browser} · ${platform}`, platform, browser }
}

async function storeSubscription(familyId: string, subscription: PushSubscription) {
  const normalized = normalizeSubscription(subscription)
  const device = describeDevice()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_family_id: familyId,
    p_endpoint: normalized.endpoint,
    p_p256dh: normalized.p256dh,
    p_auth: normalized.auth,
    p_content_encoding: normalized.contentEncoding,
    p_device_name: device.deviceName,
    p_platform: device.platform,
    p_browser: device.browser,
  })
  if (error) throw new Error(t.reminders.deviceStoreFailed)
  return normalized
}

export async function reconcileCurrentSubscription(familyId: string) {
  const capability = detectPushCapability()
  if (!capability.supported || capability.permission !== 'granted') return null
  const registration = await navigator.serviceWorker.ready
  registration.active?.postMessage({ type: 'PUSH_CONFIG', vapidPublicKey: VAPID_PUBLIC_KEY })
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  await storeSubscription(familyId, subscription)
  return subscription
}

export async function enablePushOnCurrentDevice(familyId: string) {
  const capability = detectPushCapability()
  if (!capability.supported) throw new Error(t.reminders.pushUnavailable)
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? t.reminders.permissionBlocked : t.reminders.permissionMissing)
  const registration = await navigator.serviceWorker.ready
  registration.active?.postMessage({ type: 'PUSH_CONFIG', vapidPublicKey: VAPID_PUBLIC_KEY })
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  try {
    await storeSubscription(familyId, subscription)
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => false)
    throw error
  }
  return subscription
}

export async function loadPushDevices(currentEndpoint: string | null): Promise<PushDevice[]> {
  const { data, error } = await supabase.from('push_subscriptions')
    .select('id,endpoint,device_name,platform,browser,created_at,last_seen_at,revoked_at,disabled_at')
    .order('last_seen_at', { ascending: false })
  if (error) throw new Error(t.reminders.deviceListFailed)
  return (data ?? []).map((row) => ({
    id: row.id, endpoint: row.endpoint, deviceName: row.device_name, platform: row.platform, browser: row.browser,
    createdAt: row.created_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at, disabledAt: row.disabled_at,
    current: row.endpoint === currentEndpoint,
  }))
}

export async function revokePushDevice(id: string) {
  const { data, error } = await supabase.rpc('revoke_push_subscription', { p_subscription_id: id })
  if (error || !data) throw new Error(t.reminders.deviceRemoveFailed)
}

export async function unsubscribeCurrentDevice(deviceId: string | null) {
  if (deviceId) await revokePushDevice(deviceId)
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) await subscription.unsubscribe()
}

/**
 * Called immediately before `supabase.auth.signOut()`.
 *
 * Without this, the server row keeps pointing at the signed-out user and
 * that device would go on receiving their family's messages after someone
 * else signs in on it. We revoke the server row but deliberately keep the
 * browser subscription: `register_push_subscription` clears `revoked_at` on
 * conflict, so the next sign-in on this device re-activates the same
 * endpoint instead of burning a new one.
 *
 * Best-effort by design — a failure here must never block sign-out.
 */
export async function releasePushOnSignOut() {
  try {
    if (!('serviceWorker' in navigator)) return false
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return false
    const { error } = await supabase.rpc('revoke_push_subscription_by_endpoint', {
      p_endpoint: subscription.endpoint,
    })
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


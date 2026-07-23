import { isNativeApp } from '../platform/capacitor'
import { releasePushOnSignOut as releaseWebPush } from './pushClient'

/**
 * Picks the right transport's best-effort device release before sign-out.
 * The native side is dynamically imported — same reason as in
 * `PushContext.tsx` — so `@capacitor/push-notifications` never lands in the
 * eager web bundle just because this (eagerly-loaded, sign-out-path) module
 * needs to reach it conditionally.
 */
export async function releasePushOnSignOut(): Promise<boolean> {
  if (isNativeApp()) {
    const { releasePushOnSignOut: releaseNativePush } = await import('./nativePushClient')
    return releaseNativePush()
  }
  return releaseWebPush()
}

import { App, type URLOpenListenerEvent } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '../supabaseClient'
import { normalizeRoute } from '../router'
import { NATIVE_AUTH_CALLBACK_URL } from '../lib/authRedirect'

/**
 * Applies a route the same way the browser's own back/forward navigation
 * does: update `window.location` via `pushState`, then dispatch `popstate` so
 * `RouterProvider` (if already mounted) re-syncs. No new router — this reuses
 * the exact mechanism `router.tsx` already listens for.
 *
 * Also correct for a cold start: if this runs before `RouterProvider` mounts,
 * `pushState` alone is enough — the provider's initial state reads
 * `window.location` fresh, so the `popstate` dispatch (a no-op with no
 * listener yet) isn't needed for that case, only for a warm start.
 */
export function applyNativeRoute(pathname: string, search: string) {
  const route = normalizeRoute(pathname)
  const target = `${route}${search}`
  if (`${window.location.pathname}${window.location.search}` === target) return
  window.history.pushState(null, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * Applies the same relative `deepLink` path (e.g. `/messages?c=<uuid>`) the
 * Web Push payload already uses (see `pushPayload()` in `public/sw.js`) —
 * one payload shape, understood by both transports. Used for a tapped
 * native push notification, which has no scheme/host to validate.
 */
export function applyRelativeDeepLink(deepLink: string) {
  const url = new URL(deepLink, 'https://rodinka.invalid')
  applyNativeRoute(url.pathname, url.search)
}

let lastAuthCallbackUrl: string | null = null

async function handleAuthCallback(url: string) {
  // `exchangeCodeForSession` consumes a one-time code; a duplicate delivery
  // of the same callback URL must be a no-op, not a second (failing) attempt.
  if (url === lastAuthCallbackUrl) return
  lastAuthCallbackUrl = url
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(url)
    if (error) console.error('Native OAuth callback failed:', error.message)
  } catch (error) {
    console.error('Native OAuth callback failed:', error instanceof Error ? error.message : 'unknown error')
  } finally {
    await Browser.close().catch(() => undefined)
  }
  // Sign-in success/failure both flow through the normal session listener
  // (see AuthScreen's handleGoogle comment) — nothing else to do here.
}

function handleIncomingUrl(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }

  if (url.startsWith(NATIVE_AUTH_CALLBACK_URL)) {
    void handleAuthCallback(url)
    return
  }

  // Anything else must be our own custom scheme — never act on a foreign
  // origin/scheme, and never navigate on its say-so.
  if (parsed.protocol !== new URL(NATIVE_AUTH_CALLBACK_URL).protocol) return
  applyNativeRoute(parsed.pathname, parsed.search)
}

let registered = false

export function registerNativeDeepLinks() {
  if (registered) return
  registered = true
  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => handleIncomingUrl(event.url))
}

export function resetNativeDeepLinksForTests() {
  registered = false
  lastAuthCallbackUrl = null
}

export { handleIncomingUrl as handleIncomingUrlForTests }

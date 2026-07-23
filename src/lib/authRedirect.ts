import { isNativeApp } from '../platform/capacitor'

// Central place for the URL Supabase should send the user back to after an
// OAuth redirect. On the web this derives from the current origin, which
// works unmodified on localhost, Vercel previews, and production — each
// origin just needs to be added to Supabase's allowed redirect URLs (see
// supabase-auth-setup.md). Inside the Capacitor native shell there is no
// meaningful origin to redirect to (the WebView doesn't sit at a real web
// URL), so native uses a fixed custom URL scheme instead, caught by
// `src/platform/nativeDeepLinks.ts` via `App.addListener('appUrlOpen', ...)`.
// This exact value must also be registered as a Supabase redirect URL, an
// Android intent filter, and an iOS URL type — see
// docs/CAPACITOR_NATIVE_SETUP.md.
export const NATIVE_AUTH_CALLBACK_URL = 'cz.rodinka.app://auth/callback'

interface RedirectLocation {
  origin: string
  pathname: string
  search: string
  hash: string
}

export function getAuthRedirectUrl(location: RedirectLocation = window.location): string {
  if (isNativeApp()) return NATIVE_AUTH_CALLBACK_URL
  return `${location.origin}${location.pathname}${location.search}${location.hash}`
}

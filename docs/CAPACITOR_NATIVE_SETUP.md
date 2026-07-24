# Native app setup (Capacitor)

Rodinka ships as three builds from one codebase: the web app, the installed
PWA, and now a Capacitor-wrapped native app for iOS and Android. This doc
covers the native build only — see `README.md` for the web app and
`supabase-auth-setup.md` for the Supabase/Google OAuth dashboard steps that
also apply here.

## Architecture: browser vs. native runtime

- `src/platform/capacitor.ts` — `isNativeApp()` / `getNativePlatform()`, thin
  wrappers over `@capacitor/core`'s `Capacitor.isNativePlatform()` /
  `getPlatform()`. Every other native/web branch in the app goes through
  this, not ad-hoc `window.Capacitor` checks.
- `src/main.tsx` registers the web service worker (`registerRodinkaServiceWorker`,
  offline cache + Web Push) **only** when not native, and dynamically imports
  `src/platform/lifecycle.ts` (status bar, splash screen, Android back
  button, native deep links) **only** when native. The two never run
  together, and neither module ships in the other build's bundle — both are
  behind `isNativeApp()`/dynamic `import()`, checked by
  `scripts/check-route-chunks.mjs`'s eager-bundle budget in CI-equivalent
  local runs (`npm run build`).
- `src/network/connectivity.ts` sources online/offline from
  `navigator.onLine` on the web and from `@capacitor/network` natively
  (dynamically imported, same reason). This is the single connectivity
  source app-wide — don't add another one.
- Auth: `src/supabaseClient.ts` uses the PKCE flow (works transparently on
  web); `src/lib/authRedirect.ts` returns the fixed native callback scheme
  (`NATIVE_AUTH_CALLBACK_URL`, currently `cz.rodinka.app://auth/callback`)
  instead of a web origin when native. `src/platform/nativeDeepLinks.ts`
  catches that callback via `@capacitor/app`'s `appUrlOpen` and calls
  `supabase.auth.exchangeCodeForSession(url)`.
- Push: `src/push/pushClient.ts` (Web Push/VAPID, browser only) and
  `src/push/nativePushClient.ts` (APNs/FCM via
  `@capacitor/push-notifications`, native only) implement the same
  `PushClientModule` contract (`src/push/PushClientModule.ts`).
  `src/context/PushContext.tsx` picks one via a **dynamic** import so the
  other transport's plugin code never ships in the wrong build.
- Android hardware back button: `src/platform/androidBack.ts` +
  `src/platform/backDismiss.ts`. Any dismissable overlay — `Modal`, the
  fullscreen mobile chat, the direct-conversation picker — registers with
  `useBackDismiss(active, onDismiss)`; back closes the topmost one, else
  navigates in-app history, else backgrounds the app
  (`App.minimizeApp()`) at the root screen. Never exits the process.

## Prerequisites

- Node 22 (matches this repo; Capacitor 8 needs Node ≥ 18).
- **Android**: Android Studio (current stable) with an Android SDK
  (compileSdk/targetSdk 36, minSdk 24 — see `android/variables.gradle`), a
  JDK the bundled Gradle supports (17+; Android Studio ships one).
- **iOS**: a Mac with Xcode (current stable). No CocoaPods needed —
  Capacitor 8's iOS template uses Swift Package Manager
  (`ios/App/App.xcodeproj` + `Package.swift`), which is why `cap sync ios`
  works even on this repo's Windows dev machine (it just can't *build* here).
- A Google Cloud project + OAuth client, and the Supabase dashboard access
  described in `supabase-auth-setup.md`.

## Install & first run

```bash
npm install                 # installs @capacitor/* alongside the web deps
npm run build                # produces dist/, which webDir points at
npx cap sync android          # or: npx cap sync ios
npm run native:android         # sync + open Android Studio
npm run native:ios              # sync + open Xcode
```

`android/` and `ios/` are committed to the repo (standard Capacitor
practice) — don't `.gitignore` them wholesale; their own `.gitignore`s
already exclude build output, `local.properties`, Pods/DerivedData, and a
Firebase `google-services.json` if one is ever added.

## npm scripts

| Script | What it does |
| --- | --- |
| `cap:copy` | Build, then copy web assets into both native projects (no plugin/config resync). |
| `cap:sync` | Build, then full sync (assets + plugins + config) for both platforms. |
| `cap:android` / `cap:ios` | Open the native project in Android Studio / Xcode. |
| `native:android` / `native:ios` | `cap:sync` + open, in one step. |

## Live reload against the Vite dev server

Production builds never set `server.url` (that would ship a "WebView
pointed at a website" app, not a native one). For local dev with hot reload:

```bash
CAPACITOR_DEV_SERVER_URL=http://<your-lan-ip>:5173 npx cap sync android
```

`capacitor.config.ts` reads `CAPACITOR_DEV_SERVER_URL` and only then adds a
`server.url` (with `cleartext: true`, since dev is plain HTTP). Use your
machine's LAN IP, not `localhost` — the device/emulator is a different host.
Unset the env var and re-sync to go back to the bundled build.

## Plugins used, and why

| Plugin | Why |
| --- | --- |
| `@capacitor/app` | Lifecycle, `appUrlOpen` deep links, Android `backButton`. |
| `@capacitor/browser` | Opens the system browser for native Google OAuth (never a WebView redirect). |
| `@capacitor/keyboard` | `resize: 'body'` keyboard behavior, matching the web's `interactive-widget=resizes-content`. |
| `@capacitor/status-bar` | Status bar style/color to match the brand background. |
| `@capacitor/splash-screen` | Native splash, held until first paint (`launchAutoHide: false`). |
| `@capacitor/network` | Real connectivity signal in a WebView, where `navigator.onLine` is unreliable. |
| `@capacitor/push-notifications` | APNs/FCM client registration (see Push below). |

No community plugins, no Camera (`<input type="file">` already lets a
WebView offer camera-or-gallery), no Haptics (no concrete use identified
yet), no `@capacitor/preferences` (Supabase's default `localStorage` session
storage is kept — there was no case that justified a separate secure-storage
plugin).

## App ID / bundle ID

`cz.rodinka.app` everywhere: `capacitor.config.ts`, Android
`applicationId`/manifest scheme, iOS `PRODUCT_BUNDLE_IDENTIFIER` and URL
type, the OAuth callback (`cz.rodinka.app://auth/callback`). Changing it
later means updating all of these plus the Google/Supabase dashboard
entries below — treat it as effectively permanent once either app store
listing exists.

## Supabase redirect URL (manual, dashboard)

Supabase → Authentication → URL Configuration → **Redirect URLs** — add:

```
cz.rodinka.app://auth/callback
```

alongside the existing web origins from `supabase-auth-setup.md`. Without
this, `exchangeCodeForSession` on the native callback will fail even though
the rest of the flow looks fine.

## Google OAuth (native)

The existing Google Cloud OAuth client (web application type, from
`supabase-auth-setup.md`) is reused — Supabase's own callback
(`https://<project>.supabase.co/auth/v1/callback`) is what Google redirects
to, regardless of platform, so no separate Android/iOS OAuth client is
required. What's native-specific is entirely on Rodinka's side: `AuthScreen`
calls `signInWithOAuth({ ..., skipBrowserRedirect: true })`, opens the
returned URL with `Browser.open()`, and the deep-link listener finishes the
sign-in. No changes needed in Google Cloud Console beyond what the web setup
already required.

**Sign in with Apple**: Apple requires it if a third-party login (Google,
here) is offered in an iOS App Store app. **Not implemented** — this is a
release blocker for the App Store build specifically (Android/Play Store,
and the web app, are unaffected). See `docs/NATIVE_RELEASE_CHECKLIST.md`.

## Android deep link

`android/app/src/main/AndroidManifest.xml`'s `MainActivity` has a second
`intent-filter` for `android.intent.category.BROWSABLE` +
`<data android:scheme="@string/custom_url_scheme">` (that string resource is
auto-populated by Capacitor from `capacitor.config.ts`'s `appId`).
`launchMode="singleTask"` (Capacitor's own default) means the callback
reuses the running activity instead of stacking a new one.

## iOS URL scheme

`ios/App/App/Info.plist` has a `CFBundleURLTypes` entry for
`cz.rodinka.app`. No Associated Domains / universal links are configured —
custom scheme only, which is sufficient for the OAuth round trip and for
push-notification deep links. Universal links are a possible future
hardening step, not a blocker.

## Push notifications: what's real, what's not

**Implemented and working today:**
- Client registration (`src/push/nativePushClient.ts`): permission
  request/check, `PushNotifications.register()`, storing the device token
  via the `register_native_push_token` RPC (migration
  `20260723090000_native_push_tokens.sql`, table `native_push_tokens` — a
  sibling to `push_subscriptions`, not a shared table, since an APNs/FCM
  token isn't a Web Push endpoint URL and reusing that table would mean
  relaxing its `endpoint ~ '^https://'` check).
- Foreground receive (currently a no-op — no in-app toast UI exists yet) and
  notification-tap handling, which applies the payload's `deepLink` (same
  relative-path field the Web Push payload already uses, see `pushPayload()`
  in `public/sw.js`) through the same router the rest of the app uses.
- Token revocation on sign-out (`releasePushOnSignOut` in
  `src/push/releaseOnSignOut.ts`, dispatches to the web or native client).

**Not implemented — needs the app owner's own accounts:**
- Actual APNs/FCM delivery from the backend. `supabase/functions/send-notification-deliveries`
  is untouched — it still only sends Web Push. Wiring native delivery needs:
  - **Android/FCM**: a Firebase project, `google-services.json` (excluded
    from git — see `android/.gitignore`), and a Firebase service-account
    key stored as a Supabase Edge Function secret (never in the client or
    the repo).
  - **iOS/APNs**: an Apple Developer account, an APNs Auth Key (`.p8`),
    Push Notifications capability enabled on the App ID in the Apple
    Developer portal, and the matching entitlement added in Xcode's
    Signing & Capabilities (which also regenerates the provisioning
    profile) — not pre-added here since it's meaningless without that
    portal step.
  - Extending `send-notification-deliveries` to read `native_push_tokens`
    and call FCM's HTTP v1 API / APNs HTTP/2 API.
- Until that's done, "Send test push" in Reminders still calls the same
  edge function; for a native-only device (no Web Push subscription) it
  queues the delivery but doesn't actually deliver anything — no error,
  just no native notification arrives. This is an existing, pre-Capacitor
  limitation of that endpoint (it only ever sent Web Push), not a new gap.

## Permissions declared

- Android: `INTERNET` (always needed), `POST_NOTIFICATIONS` (Android 13+,
  required before a push notification can show — declared here,
  requested at runtime by the plugin).
- iOS: no `Info.plist` usage-description keys added — no camera/photo
  library/location plugin is in use. Add one only alongside the feature
  that needs it.

## Icons & splash — regenerating

Source: `resources/*.png`, generated from the same path/color data as
`public/icon.svg` (itself generated from `src/utils/familyMark.ts` — see
that file's own comment). If the FamilyMark geometry or brand colors ever
change:

```bash
node scripts/generate-native-assets.mjs   # refreshes resources/*.png
npx capacitor-assets generate               # regenerates every platform size
npx cap sync android && npx cap sync ios
```

`@capacitor/assets` is intentionally **not** a project dependency: it pulls a
large tree of unmaintained transitive packages (old `tar`, `sharp`,
`minimatch`, …) that only show up as security advisories. It is a one-off,
local, offline asset generator whose output is committed, so run it with
`npx` (which fetches it on demand) rather than re-adding it to
`devDependencies`.

**Warning**: `npx capacitor-assets generate` *also* generates a `pwa` icon
set and, unprompted, **overwrites `public/manifest.webmanifest`'s `icons`
array to point at it and deletes `public/icon.svg`** — breaking the web/PWA
icon setup, which deliberately stays SVG-only (see
`familyBrandVisualContract.test.ts`). After running it:

```bash
git checkout -- public/icon.svg public/manifest.webmanifest
rm -rf icons   # the generated pwa/*.webp set, unused and not committed
```

`npm run test` will fail loudly (`familyBrandVisualContract.test.ts`) if you
forget this — treat that as the safety net, not a substitute for doing it.

## Troubleshooting

- **`exchangeCodeForSession` fails on native sign-in**: check the Supabase
  redirect URL allow-list (above) has the exact
  `cz.rodinka.app://auth/callback` entry.
- **Android build fails on `@color/colorPrimary` (or `colorPrimaryDark` /
  `colorAccent`) not found**: this repo's `android/app/src/main/res/values/colors.xml`
  defines them (a gap in Capacitor's own `cap add android` template,
  fixed here) — if it's ever deleted, restore it rather than assuming
  the template ships it.
- **`npx cap sync ios` on Windows**: works (SPM, no CocoaPods), but you
  cannot build or run the iOS app without a Mac + Xcode.
- **Push permission prompt never appears**: confirm
  `POST_NOTIFICATIONS` (Android) is declared and the OS version is 13+;
  older Android versions don't prompt at all (notifications are allowed
  by default pre-13).

## Known limits

- No universal links / Android App Links — custom URL scheme only.
- No in-app foreground-notification UI (banner/toast) — a tap while the
  app is foregrounded on iOS may not visibly present anything, depending
  on OS version and eventual APNs payload configuration (`aps.alert` +
  presentation options), which can't be verified without a paired Apple
  Developer account and device test.
- Native delivery (FCM/APNs) is entirely unimplemented server-side; see
  "Push notifications" above.
- No physical device/emulator/simulator testing was possible in this
  environment (no Android SDK/emulator, no macOS/Xcode). Everything above
  was verified as far as static config review, `npm run build`,
  `npx cap sync android`/`ios`, and the automated test suite (mocked
  Capacitor APIs) allow — not an on-device smoke test.

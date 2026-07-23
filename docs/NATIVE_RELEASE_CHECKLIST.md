# Native release checklist

Companion to `docs/CAPACITOR_NATIVE_SETUP.md`. Each section is independent —
work through the one relevant to what you're about to do.

## Android — debug build

- [ ] `npm run build && npx cap sync android`
- [ ] Open in Android Studio (`npm run cap:android`), let Gradle sync.
- [ ] Run on an emulator or a USB-debugging device.
- [ ] Confirm the app icon and splash show the FamilyMark, not a placeholder.

## Android — signed release / AAB

- [ ] Generate a release keystore (`keytool -genkeypair ...`) — **do not
      commit it**. Store it and its passwords outside the repo (password
      manager, CI secret store).
- [ ] Configure signing in `android/app/build.gradle` (`signingConfigs` /
      `buildTypes.release`) via Gradle properties or environment variables,
      not hardcoded passwords.
- [ ] Bump `versionCode` (integer, must increase every Play Store upload)
      and `versionName` in `android/app/build.gradle`.
- [ ] `./gradlew bundleRelease` (from `android/`) → `app/build/outputs/bundle/release/app-release.aab`.
- [ ] Verify `POST_NOTIFICATIONS` and `INTERNET` are the only permissions
      Play Console flags, matching `AndroidManifest.xml`.

## iOS — simulator

- [ ] `npm run build && npx cap sync ios`
- [ ] Open in Xcode (`npm run cap:ios`), select a simulator, Run.
- [ ] No CocoaPods step needed — Capacitor 8's iOS template uses Swift
      Package Manager; Xcode resolves `Package.swift` on first open.

## iOS — archive / TestFlight

- [ ] Apple Developer Program membership, App ID `cz.rodinka.app` registered.
- [ ] Signing & Capabilities tab: automatic signing with your team, or a
      manually managed provisioning profile.
- [ ] **Sign in with Apple** (see blocker below) — add the capability here
      if implementing before this release.
- [ ] Bump `CURRENT_PROJECT_VERSION` (build) and `MARKETING_VERSION`
      (version string) in Xcode's target settings.
- [ ] Product → Archive, then distribute via App Store Connect /
      TestFlight from the Organizer window.

## Supabase production config

- [ ] Redirect URLs include `cz.rodinka.app://auth/callback` (see setup doc).
- [ ] "Confirm email" and Google provider settings match
      `supabase-auth-setup.md` (unchanged by this native work).
- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the build environment
      match the production project, not a dev/staging one.

## OAuth callback

- [ ] Native Google sign-in opens the system browser (not an in-app
      WebView-only redirect) and returns to the app.
- [ ] Sign-in from a cold start (app not already running) works.
- [ ] Sign-in from a warm start (app already open, backgrounded during the
      Google flow) works and doesn't duplicate the session exchange.
- [ ] Tampered/foreign callback URLs are ignored (covered by
      `src/platform/nativeDeepLinks.test.ts` — no manual step needed, but
      worth knowing what's actually enforced: scheme match + one-time code
      exchange, no arbitrary redirect).

## Push credentials

- [ ] Firebase project created, `google-services.json` added to
      `android/app/` (kept out of git — confirm `android/.gitignore` still
      excludes it).
- [ ] Firebase service-account key stored as a Supabase Edge Function
      secret, never in the client bundle or the repo.
- [ ] Apple Developer: Push Notifications capability enabled on the App ID;
      Xcode Signing & Capabilities has the capability added (generates the
      entitlement + provisioning profile).
- [ ] APNs Auth Key (`.p8`) generated and stored as a Supabase secret.
- [ ] `supabase/functions/send-notification-deliveries` extended to read
      `native_push_tokens` and call FCM/APNs — **not done yet**, tracked as
      its own follow-up (see setup doc's "Push notifications" section).
- [ ] Until then: don't advertise native push as available in-product
      copy/marketing — only the client-side registration exists.

## Privacy texts

- [ ] No iOS usage-description keys are currently needed (no
      camera/photo-library/location plugin in use). Add the matching
      `NSCameraUsageDescription` etc. only alongside whichever future
      feature actually requests that permission.
- [ ] App Store privacy "nutrition label" / Play Console Data Safety form:
      declare what's actually collected today (account email, family data
      via Supabase, push token once native push ships) — fill this in
      against the real feature set at submission time, not preemptively here.

## Icons / splash

- [ ] `resources/*.png` reflect the current FamilyMark brand (regenerate
      per `docs/CAPACITOR_NATIVE_SETUP.md` if `src/utils/familyMark.ts`
      changed since).
- [ ] `npx capacitor-assets generate` has been re-run after any brand change
      and the diff synced (`npx cap sync android && npx cap sync ios`).
- [ ] `git checkout -- public/icon.svg public/manifest.webmanifest && rm -rf icons`
      afterward — `capacitor-assets generate` overwrites both, breaking the
      web/PWA icon setup (see setup doc's "Icons & splash" warning).

## Version / build numbers

- [ ] Android `versionCode` incremented (integer, strictly increasing).
- [ ] Android `versionName` matches the release.
- [ ] iOS `CURRENT_PROJECT_VERSION` incremented.
- [ ] iOS `MARKETING_VERSION` matches the release.

## Offline smoke test

- [ ] Cold-start the app with network off (airplane mode) — the existing
      offline shopping/calendar snapshot renders from IndexedDB, no crash.
- [ ] Turn network back on — sync resumes without duplicating queued
      mutations (existing offline-sync behavior, unchanged by this work —
      only the *signal* of "online" now comes from `@capacitor/network`
      instead of `navigator.onLine`).

## Sign-in / sign-out

- [ ] Email/password sign-in works.
- [ ] Child-account sign-in works.
- [ ] Google sign-in works (see "OAuth callback" above).
- [ ] Session survives a full app restart (kill + relaunch, not just
      backgrounding).
- [ ] Sign-out clears the session and revokes the native push token
      (verify the `native_push_tokens` row's `revoked_at` gets set, or that
      the Reminders push settings screen no longer shows the device as
      registered after sign-out + sign-in as someone else).

## Deep links

- [ ] A `cz.rodinka.app://open/<route>` link opens the right screen on a
      cold start.
- [ ] ...and on a warm start (app already running).
- [ ] An unknown or malformed link falls back to the home screen rather
      than crashing or doing nothing silently.

## Push tap

- [ ] Once native delivery exists (see "Push credentials" above): tapping a
      delivered notification opens the conversation/reminder it refers to,
      using the same `deepLink` field the Web Push payload already sends.
- [ ] Until then: this can only be exercised by manually invoking
      `pushNotificationActionPerformed` in a debug build — there is no way
      to trigger a real delivery without APNs/FCM configured.

## App Store / Play Console metadata

- [ ] Screenshots, description, category, age rating, support URL,
      privacy-policy URL — none of this is automatable and none of it
      exists yet; fill in against the actual store listing requirements at
      submission time.
- [ ] Data Safety (Play) / App Privacy (App Store) forms filled in
      truthfully against the feature set actually shipping in that release.

## Known release blocker: Sign in with Apple

Apple requires "Sign in with Apple" to be offered wherever a third-party
login (Google, here) is offered, for an app distributed on the iOS App
Store. **This is not implemented.** It does not block Android/Play Store or
the web app. Before submitting to the App Store:

- [ ] Add the Sign in with Apple capability (Apple Developer portal + Xcode).
- [ ] Implement `supabase.auth.signInWithIdToken({ provider: 'apple', ... })`
      using the native `ASAuthorizationAppleIDProvider` flow (a dedicated
      plugin or minimal native Swift code is needed — `@capacitor/browser`'s
      OAuth pattern used for Google doesn't apply, since Sign in with Apple
      is a native API, not a web redirect).
- [ ] Add it as a login option in `AuthScreen`, native-only (mirrors the
      existing native/web branch in `handleGoogle`).
- [ ] Update `supabase-auth-setup.md` with the Apple provider configuration.

Do not submit an iOS build offering Google sign-in without this.

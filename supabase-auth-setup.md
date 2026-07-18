# Auth setup: Supabase + Google OAuth

This app authenticates with Supabase Auth using **email + password** and
**Google OAuth**. Email magic link is no longer part of the UI. None of this
is configurable from code — the steps below must be done once, by hand, in
the Supabase dashboard and Google Cloud Console.

Project: `https://vzuxykxqlbobhgcxdmof.supabase.co` (from `VITE_SUPABASE_URL`
in `.env` — this URL is already public in the client bundle, so it's fine to
reference here).

## 1. Supabase → Authentication → Providers → Email

- [ ] Keep the **Email** provider **enabled**.
- [ ] Under Email provider settings, turn **"Confirm email" OFF**. This is
      the setting that makes `signUp()` return an active session
      immediately instead of requiring the user to click a confirmation
      link. Without this, sign-up will appear to "hang" (no session, no
      error) because the app never sends/waits for a confirmation email.
- [ ] After changing it, verify: sign up a brand-new test email/password in
      the app and confirm you land in the app (family onboarding screen)
      immediately, with no email round-trip.

## 2. Supabase → Authentication → Providers → Google

- [ ] Create a Google OAuth Client ID + secret (steps in section 4 below),
      then come back here.
- [ ] Enable the **Google** provider.
- [ ] Paste the **Client ID** and **Client Secret** from Google Cloud
      Console into the Google provider fields.
- [ ] Save.

Supabase shows its own callback URL on this same settings page — it should
match:

```
https://vzuxykxqlbobhgcxdmof.supabase.co/auth/v1/callback
```

That's the exact value to put into Google Cloud Console's **Authorized
redirect URIs** (section 4).

## 3. Supabase → Authentication → URL Configuration

Add every origin the app is served from to **Redirect URLs** (this is what
lets `supabase.auth.signInWithOAuth({ redirectTo: ... })` actually land back
in the app instead of being rejected):

- [ ] `http://localhost:5173/**` — local dev (`npm run dev`), including
      authenticated deep links.
- [ ] Your production Vercel domain, e.g. `https://<your-prod-domain>/**` —
      replace with the actual domain from the Vercel project's
      Settings → Domains tab.
- [ ] Vercel preview deployments. Vercel preview URLs look like
      `https://<project>-<hash>-<team>.vercel.app`, which changes per
      deploy. Two options:
  - Add a wildcard entry, e.g. `https://*.vercel.app/**` (broad — matches
    any Vercel-hosted app, not just yours; fine for a small dev project,
    revisit before this becomes a concern), or
  - Add your project's specific preview pattern if you know it, e.g.
    `https://rodinka-*-<your-team>.vercel.app/**`.

Also set **Site URL** to your production domain (used as the default
redirect target in some flows).

The repository includes a `vercel.json` SPA fallback. The exact
production/team domain still needs to match the value from your Vercel
dashboard.

## 4. Google Cloud Console

- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/) →
      APIs & Services → Credentials.
- [ ] Create (or reuse) a project for this app.
- [ ] Create an **OAuth 2.0 Client ID** of type **Web application**.
- [ ] **Authorized JavaScript origins** — add:
  - `http://localhost:5173`
  - your production Vercel domain, e.g. `https://<your-prod-domain>`
  - (optionally) specific preview domains if you use fixed preview URLs
- [ ] **Authorized redirect URIs** — add exactly one value, Supabase's own
      callback (not your app's URL):
  ```
  https://vzuxykxqlbobhgcxdmof.supabase.co/auth/v1/callback
  ```
- [ ] Copy the generated **Client ID** and **Client Secret** into Supabase's
      Google provider settings (section 2).

## 5. Google OAuth consent screen

- [ ] Check APIs & Services → OAuth consent screen.
- [ ] If it's in **Testing** mode, Google only allows sign-in for accounts
      explicitly added under **Test users** — add every Google account
      you'll use to test with (e.g. your own).
- [ ] "Publish" the app (move out of Testing) once you're ready for anyone
      to sign in with Google, not just test users. For a small family app
      this may not be necessary for a long time — Testing mode is fine for
      dev/family use as long as every real user's Google account is added
      as a test user.

## 6. Changing the login email (More → Account → "Změnit e-mail")

The app changes the signed-in user's login email with
`supabase.auth.updateUser({ email })`, i.e. the normal user-scoped Supabase
flow — no admin API, no service role, no SQL against `auth.users`. Supabase
Auth stays the only source of truth; nothing mirrors the address into
`members` or a profile table, and `family_member_emails` reads it live from
`auth.users`.

**The behaviour depends on section 1's "Confirm email" setting**, so be aware
which one you're running:

- **"Confirm email" OFF (current setting)** — the change applies
  **immediately**, with no confirmation email. The UI detects this from the
  returned user and says the address *has been changed*.
- **"Confirm email" ON** — Supabase parks the address in `new_email` and mails
  a confirmation link. The UI then says a link was sent, shows a "Čeká na
  potvrzení" badge on the account row, and keeps the old address active until
  the link is clicked.

The app handles both correctly and never claims a link was sent when it
wasn't. Turn "Confirm email" ON if you want a changed address to be proven
before it can be used to sign in — worth it, since the login email is a
credential. Note this also re-enables the sign-up confirmation round-trip that
section 1 deliberately turned off, so treat it as a product decision.

- [ ] Optional: **Authentication → Providers → Email → "Secure email change"**.
      With it enabled Supabase asks for confirmation in **both** the old and
      the new mailbox. The UI's wording already allows for this ("může být
      potřeba potvrdit odkaz v původní i nové e-mailové schránce").
- [ ] **Redirect URLs** — the confirmation link comes back to `<origin>/more`.
      The existing `/**` wildcards from section 3 already cover it; no new
      entry is needed. Without those wildcards, add `http://localhost:5173/more`
      and `https://<your-prod-domain>/more`.
- [ ] **Email templates** — no change required. The default "Change Email
      Address" template works. If you customize it, keep `{{ .ConfirmationURL }}`
      intact, and note the template is in English by default while the app UI
      is Czech.

## Verifying it all works

1. Sign up with a brand-new email + password → should land in the app
   immediately (no email check).
2. Sign in with that same email + password → should work.
3. Click "Pokračovat přes Google" → should redirect to Google's account
   picker/consent screen, then back into the app, signed in.
4. Repeat 1–3 once against a deployed Vercel preview URL and once against
   production, since each origin needs to be independently allow-listed
   (section 3) and, for Google, added to Authorized JavaScript origins
   (section 4).

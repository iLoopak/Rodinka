# Family Organizer

A PWA for managing family life: shared activity/club schedules, medical
appointments, chores tied to allowance, and weekly meal planning — built for
non-technical parents, starting Czech-first.

## Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Supabase (Postgres + Auth + Row Level Security)
- **Auth:** Magic link (passwordless email)
- **Target platforms:** PWA first; Capacitor wrap for Android/iOS stores later

## Status: Phase 0 (Foundation) — in progress

Phase 0 covers the shared "Family" data model and auth, before any real
feature module is built. See `supabase/` for the DB schema and `src/` for the
app shell.

### Data model

- **families** — the top-level shared tenant. All data belongs to a family.
- **members** — a person in a family. Has a `role` (`admin`, `parent`,
  `child`). Children may have no linked `auth.users` row — a parent manages
  their data on their behalf.
- **invites** — short codes that let a second parent join an existing
  family.

Row Level Security enforces that a logged-in user can only ever see data
belonging to families they're a member of. See `supabase/001_schema.sql` for
table definitions and RLS policies, and `supabase/002_functions.sql` for the
`create_family` / `create_invite` / `redeem_invite` RPC functions the app
calls.

### App flow (implemented so far)

1. Not logged in → `LoginScreen` (magic link via email)
2. Logged in, no family yet → `OnboardingScreen` (create a family, or join
   via invite code)
3. Logged in, has a family → placeholder dashboard (this is where feature
   modules attach next)

See `src/App.tsx` for how these states are wired together via the
`useSession` and `useFamily` hooks.

## Roadmap (planned, not yet built)

1. ~~Phase 0: Foundation (family/member model, auth, invites)~~ ← current
2. Phase 1: Chores + Allowance (assign chores, mark done, parent approves,
   allowance ledger)
3. Phase 2: Activities/Clubs + Medical tracker (structured records with
   due-date reminders)
4. Phase 3: Meal planning/voting
5. Phase 4: Calendar sync (Google Calendar API first; Apple/iCloud via
   CalDAV later, lower priority — more effort, less API support)
6. Phase 5: Capacitor wrap for Android/iOS app stores

## Local setup

```bash
npm install
cp .env.example .env
# fill in .env with your Supabase project URL + anon key
# (Project Settings → API in the Supabase dashboard)
npm run dev
```

In Supabase, run `supabase/001_schema.sql` then `supabase/002_functions.sql`
in the SQL Editor (in that order — functions depend on tables existing) if
you're setting up a fresh project.

Also add `http://localhost:5173` to **Authentication → URL Configuration →
Redirect URLs** in the Supabase dashboard so magic links work locally.

## Open decisions (not yet finalized)

- Monetization model: one-time purchase, subscription, or freemium
- Whether children ever get their own login vs. always parent-managed
- Localization: Czech-first vs. English-first for initial launch

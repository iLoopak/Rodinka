# Rodinka

A PWA for managing family life: shared activity/club schedules, medical
appointments, chores tied to allowance, and weekly meal planning — built for
non-technical parents, starting Czech-first (CZ + EN).

## Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Supabase (Postgres + Auth + Row Level Security)
- **Auth:** Magic link (passwordless email)
- **Target platforms:** PWA first; Capacitor wrap for Android/iOS stores later

## Status: Phase 1 (Chores + Allowance) — in progress

Phase 0 built the shared "Family" data model and auth. Phase 1 adds the
first real feature module on top of it. See `supabase/` for the DB schema
and `src/` for the app code.

### Data model

- **families** — the top-level shared tenant. All data belongs to a family.
- **members** — a person in a family. Has a `role` (`admin`, `parent`,
  `child`). Children may have no linked `auth.users` row — a parent manages
  their data on their behalf.
- **invites** — short codes that let a second parent join an existing
  family.
- **chores** — a task belonging to a family, assigned to one child member,
  with a `reward_amount` and a `recurring` flag.
- **chore_completions** — a log of each time a chore is marked done, with a
  `status` (`pending_approval`, `approved`, `rejected`).
- **allowance_ledger** — a running record of amounts owed/paid per child;
  positive entries are credits (from approved chores), negative entries are
  payouts.

Row Level Security enforces that a logged-in user can only ever see data
belonging to families they're a member of. See `supabase/001_schema.sql` for
the Phase 0 tables/policies, `supabase/002_functions.sql` for the
`create_family` / `create_invite` / `redeem_invite` RPC functions, and
`supabase/003_chores.sql` for the Phase 1 tables/policies plus the
`approve_chore_completion` / `reject_chore_completion` / `record_payout` RPC
functions (approving a completion and crediting the ledger happens
atomically inside `approve_chore_completion`).

### App flow (implemented so far)

1. Not logged in → `LoginScreen` (magic link via email)
2. Logged in, no family yet → `OnboardingScreen` (create a family, or join
   via invite code)
3. Logged in, has a family → dashboard with `ChoresDashboard`: add a child,
   add a chore and assign it, mark chores done, approve/reject pending
   completions, see each child's allowance balance, and record payouts

See `src/App.tsx` for how these states are wired together via the
`useSession` and `useFamily` hooks.

### Localization

All user-facing text lives in `src/strings.ts`, keyed by language (`cs`/`en`),
same centralized-strings pattern as the invoicing app. Components import `t`
from `strings.ts` rather than hardcoding any text. Currently hardcoded to
`cs` (Czech-first) via `currentLang` — a real language switcher (stored
per-user, or browser-locale detection) is a Phase 1+ task, not Phase 0.

## Roadmap (planned, not yet built)

1. ~~Phase 0: Foundation (family/member model, auth, invites)~~
2. ~~Phase 1: Chores + Allowance (assign chores, mark done, parent approves,
   allowance ledger)~~ ← current
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

In Supabase, run `supabase/001_schema.sql`, `supabase/002_functions.sql`,
then `supabase/003_chores.sql` in the SQL Editor (in that order — later
files depend on earlier tables/functions existing).

Also add `http://localhost:5173` to **Authentication → URL Configuration →
Redirect URLs** in the Supabase dashboard so magic links work locally.

## Open decisions (not yet finalized)

- Monetization model: one-time purchase, subscription, or freemium
- Whether children ever get their own login vs. always parent-managed
- Localization: Czech-first vs. English-first for initial launch

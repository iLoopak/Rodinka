# Rodinka

A PWA for managing family life: shared activity/club schedules, medical
appointments, chores tied to allowance, and weekly meal planning — built for
non-technical parents, starting Czech-first (CZ + EN).

## Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Supabase (Postgres + Auth + Row Level Security)
- **Auth:** Email + password, and Google OAuth, via Supabase Auth. Email
  confirmation is disabled (see `supabase-auth-setup.md`) so sign-up doesn't
  depend on email deliverability. Magic link is no longer part of the UI.
- **Target platforms:** PWA first; Capacitor wrap for Android/iOS stores later

## Status: Phase 2 (Activities/Clubs + Medical tracker + Calendar) — in progress

Phase 0 built the shared "Family" data model and auth. Phase 1 added
Chores + Allowance. Phase 2 adds Activities/Clubs, a Medical tracker, and a
unified in-app Calendar that projects chores/activities/medical records
into one view — no external calendar sync. See `supabase/` for the DB
schema and `src/` for the app code.

### Data model

- **families** — the top-level shared tenant. All data belongs to a family.
- **members** — a person in a family. Has a `role` (`admin`, `parent`,
  `child`). Children may have no linked `auth.users` row — a parent manages
  their data on their behalf.
- **invites** — short codes that let a second parent join an existing
  family.
- **chores** — a task belonging to a family, assigned to exactly one family
  member (any role — child, parent, or admin), with a `reward_amount`, a
  `due_date` (date-only — which day, not a precise time), and a `recurring`
  flag.
- **chore_completions** — a log of each time a chore is marked done, with a
  `status` (`pending_approval`, `approved`, `rejected`).
- **allowance_ledger** — a running record of amounts owed/paid per child;
  positive entries are credits (from approved chores), negative entries are
  payouts.
- **activities** — a recurring or one-off club/lesson/camp. Belongs to a
  `child_id` (the participant) and optionally a `responsible_member_id` /
  `secondary_responsible_member_id` (accompanying adults — a distinct role
  from the participant). Carries schedule (`start_date`/`end_date`,
  `recurrence_type` + `recurrence_weekdays`, `start_time`/`end_time`),
  contact/location, payment (`payment_amount`/`payment_frequency`/
  `next_payment_due_date`), `status` (`active`/`paused`/`finished`), and a
  simple reminder flag.
- **medical_records** — a visit, checkup, or vaccination for any family
  member (`patient_id`, optional `responsible_member_id`). Carries
  `record_type`, `status` (`planned`/`completed`/`cancelled`),
  `next_due_date` / `recurrence_interval_months` for follow-ups, and
  vaccination-specific fields (`vaccine_name`, `vaccine_dose_number`,
  `vaccine_next_dose_date`, ...) used only when `record_type = 'vaccination'`.
  Deliberately lightweight — reminders and visit history, not a clinical
  record system.

There is no separate "calendar" table — `src/utils/calendarEntries.ts`
derives calendar entries from chores/activities/medical_records on demand
for a given date range (recurring activity occurrences are expanded by
`src/utils/recurrence.ts`, also on demand, within a bounded range). Nothing
about the calendar is persisted independently.

Row Level Security enforces that a logged-in user can only ever see data
belonging to families they're a member of. See `supabase/001_schema.sql` for
the Phase 0 tables/policies, `supabase/002_functions.sql` for the
`create_family` / `create_invite` / `redeem_invite` RPC functions,
`supabase/003_chores.sql` for the Phase 1 tables/policies plus the
`approve_chore_completion` / `reject_chore_completion` / `record_payout` RPC
functions (approving a completion and crediting the ledger happens
atomically inside `approve_chore_completion`), `supabase/004_chore_due_date.sql`
for the `chores.due_date` column plus a tightened insert policy that
verifies a chore's `assigned_to` belongs to the same family, and
`supabase/005_activities_medical.sql` for the `activities` and
`medical_records` tables (same same-family-reference check applied to their
child/patient/responsible-adult columns from the start).

### App flow (implemented so far)

1. Not logged in → `AuthScreen` (email + password sign in/sign up, or
   "Pokračovat přes Google")
2. Logged in, no family yet → `OnboardingScreen` (create a family, or join
   via invite code)
3. Logged in, has a family → `AppShell` with bottom navigation across
   `TodayDashboard`, `CalendarScreen`, `ChoresScreen`, `FamilyScreen`, and
   `MoreScreen`. `ActivitiesScreen` and `HealthScreen` are reachable from
   More and from Today's summary links (kept out of the bottom nav to avoid
   overcrowding it — see the PR description for the reasoning).

See `src/App.tsx` for how these states are wired together via the
`useSession` and `useFamily` hooks, and `src/context/FamilyDataContext.tsx`
for the shared chores/allowance/activities/medical/family data layer used
once a family exists.

### Localization

All user-facing text lives in `src/strings.ts`, keyed by language (`cs`/`en`),
same centralized-strings pattern as the invoicing app. Components import `t`
from `strings.ts` rather than hardcoding any text. Currently hardcoded to
`cs` (Czech-first) via `currentLang` — a real language switcher (stored
per-user, or browser-locale detection) is a Phase 1+ task, not Phase 0.

## Roadmap (planned, not yet built)

1. ~~Phase 0: Foundation (family/member model, auth, invites)~~
2. ~~Phase 1: Chores + Allowance (assign chores, mark done, parent approves,
   allowance ledger)~~
3. ~~Phase 2: Activities/Clubs + Medical tracker + unified in-app
   Calendar~~ ← current
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
`supabase/003_chores.sql`, `supabase/004_chore_due_date.sql`, then
`supabase/005_activities_medical.sql` in the SQL Editor (in that order —
later files depend on earlier tables/functions existing).

Run `npm test` for the unit tests (pure date/recurrence/calendar-projection
logic — see `src/utils/*.test.ts`). There's no component/UI test setup yet;
that's a known gap, not a Phase 2 goal.

Auth (email/password + Google) needs a few settings changed in the Supabase
dashboard and a Google Cloud OAuth client — see `supabase-auth-setup.md` for
the exact steps, including which redirect URLs to allow for local dev,
Vercel previews, and production.

## Open decisions (not yet finalized)

- Monetization model: one-time purchase, subscription, or freemium
- Whether children ever get their own login vs. always parent-managed
- Localization: Czech-first vs. English-first for initial launch

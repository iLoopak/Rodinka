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

## Status: Phase 3 (Meal Planning + Family Voting) — in progress

Phase 0 built the shared "Family" data model and auth. Phase 1 added
Chores + Allowance. Phase 2 added Activities/Clubs, a Medical tracker, and
a unified in-app Calendar. Phase 3 adds a shared meal idea library,
lightweight family voting on what to eat, and a weekly meal planner with
optional responsibility assignment — see `supabase/` for the DB schema and
`src/` for the app code.

### Data model

- **families** — the top-level shared tenant. All data belongs to a family.
- **members** — a person in a family. Has a `role` (`admin`, `parent`,
  `child`). Children may have no linked `auth.users` row — a parent manages
  their data on their behalf. Editable profiles add an optional birth date,
  stable member color (`brick`, `coral`, `sky`, `sage`, `honey`, `lavender`,
  or `berry`), private avatar object path, and wording preference
  (`masculine`, `feminine`, or `neutral`). A missing color keeps the existing
  deterministic ID-based fallback; missing wording uses neutral sentences.
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

- **meals** — a shared, reusable family meal idea library (e.g. "Spaghetti
  bolognese", "Leftovers"). Just `name`, `category`, a `tags text[]` (small
  suggested vocabulary plus free-form custom tags — no join table, same
  precedent as `activities.recurrence_weekdays`), optional `prep_minutes`/
  `notes`/`source_url`, and a soft `status` (`active`/`archived`).
- **meal_vote_rounds** — a family vote on what to eat (`draft` → `open` →
  `closed`). At most one `open` round per family at a time (enforced by a
  partial unique index); closed rounds are kept for history.
- **meal_vote_candidates** — which meals are up for a vote in a round.
  `meal_title` is snapshotted when the candidate is added, so a later
  rename/archive of the source meal never changes how a historical round
  reads.
- **meal_votes** — one row per (candidate, member); `value` is -1/0/1
  (dislike/neutral/like). A parent can vote on behalf of any member of
  their family, including children (who have no login) — `created_by` is
  who recorded the vote, `member_id` is who it's for.
- **meal_plan_entries** — one row per date + meal slot. Either a `meal_id`
  linked to the library (title snapshotted at add time) or a one-off
  custom `title` — never neither, enforced by a check constraint.
  `responsible_member_id` is optional. `origin` distinguishes manually
  added / added from a vote result / copied from another week.

There is no separate "calendar" table — `src/utils/calendarEntries.ts`
derives calendar entries from chores/activities/medical_records/meal plan
entries on demand for a given date range (recurring activity occurrences
are expanded by `src/utils/recurrence.ts`, also on demand, within a
bounded range). Nothing about the calendar is persisted independently.
Only `confirmed`/`completed` meal plan entries are projected onto the
calendar (as a dedicated, filterable "meal" type) — `proposed`/`skipped`
entries stay out to avoid flooding it with every rough idea; see the
Phase 3 PR description for the full reasoning.

Row Level Security enforces that a logged-in user can only ever see data
belonging to families they're a member of. See `supabase/001_schema.sql` for
the Phase 0 tables/policies, `supabase/002_functions.sql` for the
`create_family` / `create_invite` / `redeem_invite` RPC functions,
`supabase/003_chores.sql` for the Phase 1 tables/policies plus the
`approve_chore_completion` / `reject_chore_completion` / `record_payout` RPC
functions (approving a completion and crediting the ledger happens
atomically inside `approve_chore_completion`), `supabase/004_chore_due_date.sql`
for the `chores.due_date` column plus a tightened insert policy that
verifies a chore's `assigned_to` belongs to the same family,
`supabase/005_activities_medical.sql` for the `activities` and
`medical_records` tables (same same-family-reference check applied to their
child/patient/responsible-adult columns from the start), and
`supabase/006_meal_planning.sql` for the meal library/voting/plan tables
plus the `open_vote_round` / `close_vote_round` RPC functions (opening a
round atomically checks it's still a draft, that no other round is
already open, and that it has at least one candidate).

`supabase/007_member_profiles.sql` adds editable member profiles and the
private `member-avatars` Storage bucket. Profile writes go exclusively
through `update_member_profile`: an admin/parent can update themself and
children in the same family, while a linked child account can only update
its own color, avatar, and wording preference. Other adults, siblings,
cross-family members, and unauthenticated callers are denied. Direct member
updates are intentionally unavailable, and direct inserts are limited to an
admin/parent adding a child; the existing security-definer family/invite RPCs
continue to create adult memberships. Avatar read/write policies apply the
same family/profile permission logic, and signed URLs are derived temporarily
in the frontend rather than stored in `members`.

### App flow (implemented so far)

1. Not logged in → `AuthScreen` (email + password sign in/sign up, or
   "Pokračovat přes Google")
2. Logged in, no family yet → `OnboardingScreen` (create a family, or join
   via invite code)
3. Logged in, has a family → `AppShell` with bottom navigation across
   `TodayDashboard`, `CalendarScreen`, `ChoresScreen`, `FamilyScreen`, and
   `MoreScreen`. `ActivitiesScreen`, `HealthScreen`, and `MealPlanScreen`
   are reachable from More and from Today's summary links (kept out of the
   bottom nav to avoid overcrowding it — see the Phase 2/3 PR descriptions
   for the reasoning). `MealPlanScreen` itself has three internal tabs —
   Plán / Hlasování / Jídla — rather than being three separate destinations.

See `src/App.tsx` for how these states are wired together via the
`useSession` and `useFamily` hooks, and `src/context/FamilyDataContext.tsx`
for the shared chores/allowance/activities/medical/meals/family data layer
used once a family exists. Meal-specific state and mutations live in
`src/context/useMealsData.ts`, a composing hook that `FamilyDataContext`
calls and spreads into its own value — kept separate purely to stop that
file from growing into a monolith, not a second data boundary.

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
   Calendar~~
4. ~~Phase 3: Meal Planning + Family Voting (meal idea library, lightweight
   voting rounds, weekly meal planner)~~ ← current
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
`supabase/003_chores.sql`, `supabase/004_chore_due_date.sql`,
`supabase/005_activities_medical.sql`, then `supabase/006_meal_planning.sql`
and `supabase/007_member_profiles.sql` in the SQL Editor (in that order — later files depend on earlier
tables/functions existing).

Migration `007_member_profiles.sql` creates and configures the private
`member-avatars` bucket, its 5 MB JPEG/PNG/WebP restrictions, and all Storage
policies idempotently. No manual bucket or policy setup is needed in the
Supabase Dashboard.

Run `npm test` for the unit tests (pure date/recurrence/calendar-projection/
vote-ranking/weekly-planning logic — see `src/utils/*.test.ts`). There's no
component/UI test setup yet; that's a known gap, not a goal of any phase so far.

Auth (email/password + Google) needs a few settings changed in the Supabase
dashboard and a Google Cloud OAuth client — see `supabase-auth-setup.md` for
the exact steps, including which redirect URLs to allow for local dev,
Vercel previews, and production.

## Open decisions (not yet finalized)

- Monetization model: one-time purchase, subscription, or freemium
- Whether children ever get their own login vs. always parent-managed
- Localization: Czech-first vs. English-first for initial launch

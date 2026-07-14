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
  `due_date` (date-only — which day, not a precise time), structured
  recurrence (`none`/`daily`/`weekly`/`monthly`), optional ISO weekdays,
  a preserved preferred monthly day, and an `active`/`archived` status. The
  legacy `recurring` flag remains synchronized for compatibility.
- **chore_completions** — a log of each time a chore is marked done, with a
  `status` (`pending_approval`, `approved`, `rejected`) plus immutable
  occurrence due-date, title, and reward snapshots.
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
belonging to families they're a member of. See `supabase/migrations/20260714000100_schema.sql` for
the Phase 0 tables/policies, `supabase/migrations/20260714000200_functions.sql` for the
`create_family` / `create_invite` / `redeem_invite` RPC functions,
`supabase/migrations/20260714000300_chores.sql` for the Phase 1 tables/policies plus the
`approve_chore_completion` / `reject_chore_completion` / `record_payout` RPC
functions (approving a completion and crediting the ledger happens
atomically inside `approve_chore_completion`), `supabase/migrations/20260714000400_chore_due_date.sql`
for the `chores.due_date` column plus a tightened insert policy that
verifies a chore's `assigned_to` belongs to the same family,
`supabase/migrations/20260714000500_activities_medical.sql` for the `activities` and
`medical_records` tables (same same-family-reference check applied to their
child/patient/responsible-adult columns from the start), and
`supabase/migrations/20260714000600_meal_planning.sql` for the meal library/voting/plan tables
plus the `open_vote_round` / `close_vote_round` RPC functions (opening a
round atomically checks it's still a draft, that no other round is
already open, and that it has at least one candidate).

`supabase/migrations/20260714000700_member_profiles.sql` adds editable member profiles and the
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

`supabase/migrations/20260714000900_chore_recurrence_lifecycle.sql` upgrades the former boolean
chore recurrence to `none`/`daily`/`weekly`/`monthly`, backfilling legacy
`recurring=true` rows as weekly because the old schema stored no cadence. It
also snapshots every completion occurrence and replaces chore approval with
an atomic operation that approves once, credits the linked ledger row once,
and either archives a one-off chore or advances a recurring chore to its next
non-past due date. Chores are archived rather than deleted so history and
allowance-plan references remain intact. Scheduling, reward, assignee, and
status changes are blocked while a completion is pending approval; the UI
uses the simpler rule of disabling all editing until that completion is
approved or rejected.

`supabase/migrations/20260714001000_shared_shopping_list.sql` adds the family-scoped shopping list,
bounded purchase history, safe normalized duplicate handling, actor snapshots,
and reusable meal ingredients. Shopping creation, purchase toggles, batch
imports, previous-list copies, and ingredient replacement use validated RPCs;
RLS and triggers reject cross-family member, meal, and plan-entry references.
Purchased rows are archived rather than deleted when the visible list is
cleared, so common-item suggestions and previous shopping sessions remain
available without introducing a separate inventory model.

### App flow (implemented so far)

1. Not logged in → `AuthScreen` (email + password sign in/sign up, or
   "Pokračovat přes Google")
2. Logged in, no family yet → `OnboardingScreen` (create a family, or join
   via invite code)
3. Logged in, has a family → `AppShell` with bottom navigation across
   `TodayDashboard`, `CalendarScreen`, `ChoresScreen`, `FamilyScreen`, and
   `MoreScreen`. `ActivitiesScreen`, `HealthScreen`, `MealPlanScreen`, and
   `ShoppingScreen`
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

### Monthly allowance plans

`allowance_plans` defines an independent monthly allowance for a child. It
can be unconditional or reference recurring chores through
`allowance_plan_requirements`; individual `reward_amount` chore credits remain
supported at the same time. A cycle is anchored to the configured payout day:
the evaluated interval is the previous payout date (inclusive) through the
current payout date (exclusive), with the first interval clamped to `starts_on`.
Days 29–31 are clamped to the month's last day. Weekly requirements use
Monday–Sunday buckets and include a partial edge week only when at least four
of its days are inside the cycle.

Parents explicitly settle due cycles through the idempotent
`credit_monthly_allowance` or `skip_monthly_allowance` RPC. Crediting adds money
owed to the child's existing ledger; the separate payout action records money
physically handed over and reduces that balance. Ledger `entry_type` values are
`chore_reward`, `monthly_allowance`, `payout`, and `adjustment`, with unique
source links preventing duplicate chore or monthly credits.

### Family events and participants

Activities are classified as `club` or `event`. Participants are stored in
`activity_participants`, allowing any non-empty subset of current family
members; “select whole family” is only a form shortcut and stores explicit
member rows. Create and update RPCs write the activity and participant set in
one transaction. The legacy `child_id` is retained as a compatibility pointer
to the first participant.

For `one_off` records, `end_date` is the inclusive last event day. A multi-day
event remains one database row and is projected into every covered calendar
day; Agenda deduplicates those projections back to one range row. For recurring
activities, `end_date` keeps its existing meaning as the series cutoff.

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

Database changes are versioned in `supabase/migrations`. Link the CLI once with
`npx supabase login` and `npx supabase link --project-ref <project-ref>`, then
review and deploy pending migrations with:

```bash
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Do not re-run migrations through the SQL Editor. The CLI records applied
versions and skips them on later pushes.

Migration `008_allowance_plans_family_events.sql` adds allowance plans,
requirements, settled cycles, ledger provenance, activity kinds/all-day
semantics, generalized participants, RLS, integrity guards, and the atomic
credit/skip/activity RPCs. Existing activities are backfilled with their
original child as a participant; existing positive ledger entries are assumed
to be historical chore rewards and negative entries payouts because older rows
did not retain stronger provenance.

Migration `007_member_profiles.sql` creates and configures the private
`member-avatars` bucket, its 5 MB JPEG/PNG/WebP restrictions, and all Storage
policies idempotently. No manual bucket or policy setup is needed in the
Supabase Dashboard.

Run `npm test` for the unit tests (pure date/recurrence/calendar-projection/
vote-ranking/weekly-planning logic — see `src/utils/*.test.ts`). There's no
component/UI test setup yet; that's a known gap, not a goal of any phase so far.

### Notifications and Reminder Center

Phase 4 adds a normalized, persisted reminder lifecycle. A centralized rule
engine derives responsibility-aware reminders from chores, activities and
payments, medical appointments and vaccinations, meal voting and planning,
allowance approvals, and assigned shopping items. Related routine items are
grouped; source IDs and occurrence dates remain in metadata so a group can be
updated or resolved without producing one alert per item. Read, dismissed and
resolved state is stored separately, and completed history is retained for 90
days. The bell route is `/reminders`; source links reuse the existing query and
hash deep-link conventions.

Preferences are per linked member. Existing members default to in-app reminders
on, every category on, push off, digests off, quiet reminders visible in-app,
and quiet hours disabled (21:00-07:00 is only the default interval). The browser
timezone is stored when the preference row is first created. Daily and weekly
digests are mutually exclusive in the UI and are generated from the same active
reminder set.

Production push delivery is intentionally not enabled. The repository has no
service worker push handler, subscription endpoint, application server key, or
trusted scheduler. The settings screen exposes this boundary instead of asking
for browser permission or pretending that foreground-only delivery is push.
A future implementation needs a service worker, subscription persistence and
revocation, a server-side Web Push sender, and a scheduled digest job; no new
deployment variables are required for the current in-app implementation.

Phase 4.1 adds browser-independent reminder processing and a durable planned
delivery outbox. Deployment, Vault-authenticated ten-minute Cron setup, dry-run,
verification and rollback instructions are in
[`supabase-reminder-processing.md`](./supabase-reminder-processing.md). Actual
Web Push subscriptions and sending remain intentionally deferred to PR2.

There is currently no documents entity/module in Rodinka. Document-expiry rule
contracts (30/7/1 days and overdue) are implemented and tested, but no reminders
are generated until a real family-scoped document source is added. Document
drafts deliberately have no deep link until a real authorized detail route
exists.

Migration `20260714110000_notifications_reminder_center.sql` adds
`notification_preferences`, `reminders`, the idempotent
`sync_member_reminders` RPC, RLS policies, and activity payment occurrence
tracking. Apply it through the normal Supabase CLI migration flow before
deploying the matching frontend.

Migration `20260714120000_notifications_hardening.sql` narrows client-side state
changes to a read/dismiss RPC, serializes syncs per member, validates reminder
payloads and deep links, avoids rewriting unchanged rows, and adds the indexes
used by active-reminder and 90-day retention queries. Its cleanup deletes only
resolved or dismissed history older than 90 days; actionable reminders are not
expired by age.

Migration `20260714121000_reminder_source_guards.sql` adds a database trigger
that rejects nonexistent and cross-family source IDs. Document reminders remain
blocked at this boundary until a real family-scoped document table exists.

Reminder generation runs after the authenticated family data has loaded, not
only when `/reminders` is open. Relevant same-tab mutations regenerate from the
refreshed source hooks. Visible tabs refresh reminder sources every 15 minutes,
when connectivity returns, and after returning from the background for at least
two minutes. A family-scoped local-storage signal asks other open tabs to refresh;
read, dismissed and preference changes are additionally scoped to the member.
The database unique key and serialized sync remain the final duplicate guard.

This is still a foreground lifecycle: while every Rodinka tab/device is closed,
there is no worker or trusted scheduler and no new reminder rows are generated.
The next app open/foreground refresh catches up from current source data. Digest
settings therefore enable an in-app preview only; scheduled delivery, push and
quiet-hours enforcement remain worker responsibilities.

| Source mutation | Foreground refresh path | Deep link |
| --- | --- | --- |
| Chores and approvals | chore/completion refresh | `/chores?chore=...` or pending approvals |
| Activities and payments | activity refresh | `/activities?activity=...` or payments |
| Medical and vaccinations | medical refresh | `/health?record=...` |
| Voting and meal plan | vote/plan refresh | `/meals?round=...#vote` or dated plan |
| Shopping assignment/state | shopping refresh | `/shopping?filter=assigned-to-me` |
| Documents | no source module yet | none |

For disaster recovery, include `notification_preferences` and `reminders` in
the normal Supabase/Postgres backup schedule and test a point-in-time or logical
restore in a separate project. Restoring these tables is safe but optional for
correctness: after source tables are restored, an authenticated foreground sync
can reconstruct active reminder content; read/dismissed history is recoverable
only from backup. Keep migration history with the backup and never restore these
two tables without their referenced `families` and `members` rows.

Auth (email/password + Google) needs a few settings changed in the Supabase
dashboard and a Google Cloud OAuth client — see `supabase-auth-setup.md` for
the exact steps, including which redirect URLs to allow for local dev,
Vercel previews, and production.

## Open decisions (not yet finalized)

- Monetization model: one-time purchase, subscription, or freemium
- Whether children ever get their own login vs. always parent-managed
- Localization: Czech-first vs. English-first for initial launch

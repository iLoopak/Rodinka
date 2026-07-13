# Rodinka — Feature Roadmap

## Phase 0 — Foundation ✅ Done
- Family / Member / Invite data model (Postgres + Row Level Security)
- Magic-link auth (passwordless email)
- Onboarding: create a new family, or join an existing one via invite code
- Vite + React + TypeScript PWA shell
- Centralized CZ/EN string system (`src/strings.ts`), Czech-first

## Phase 1 — Chores + Allowance ✅ Done
- Parent creates chores, assigns to a child, sets a reward amount
- Child (or parent, on their behalf) marks a chore done
- Parent approves or rejects completions
- Allowance ledger: running balance per child, credited on approval
- Manual payout recording (parent marks money actually paid out)
- *Deliberately simple for v1:* no recurring-task scheduler yet — just a
  boolean flag; real recurrence logic comes later once the core loop is
  validated with actual use

## Visual identity foundation ✅ Done
- Implemented per `visual-identity.md`: color tokens, Manrope type, card/button/
  badge components, the four-piece mosaic logo mark, and the "Dnes u nás"
  chronological home screen (needs attention / this week / how we're doing,
  with setup actions tucked into a collapsible "Spravovat" section)
- Module accent colors wired up for Phase 1 (sage = chores, lavender =
  allowance); sky, honey, and berry are reserved and ready for Phase 2/3
  (activities, meals, medical) to reuse the same `.section.accent-*` pattern
  in `src/index.css`
- Per-member avatar colors from the doc are *not* implemented yet — `members`
  has no color field; revisit if/when that's worth the schema change

## Phase 2 — Activities/Clubs + Medical Tracker (planned)
- Structured records for swim class, dance, etc. — coach contact,
  membership/payment due dates, skill level
- Medical: checkups, dentist visits, vaccination history, next-due reminders
- Due-date badges/timeline view — no calendar sync needed yet, this validates
  whether the structured-record idea is valuable on its own first

## Phase 3 — Meal Planning / Voting (planned)
- Weekly lunch/dinner plan
- Family members vote on options
- Lower priority, lighter build — good filler feature once core loop (Phase 1)
  is proven with real usage

## Phase 4 — Calendar Sync (planned, later)
- Google Calendar API first (clean REST API, two-way sync)
- Apple/iCloud via CalDAV — more effort, lower priority, may be optional
- Only worth building once Phases 1–2 show people actually want the
  structured data reflected in their existing calendar — this is the most
  technically expensive phase, intentionally saved for last

## Phase 5 — Native App Store Presence (planned, later)
- Capacitor wrap of the PWA for Android/iOS app stores
- Push notifications become more reliable as native apps, especially on iOS
- Worth doing once daily retention/usage justifies the extra packaging work

---

## Open decisions (not yet finalized, revisit as phases progress)
- Monetization: one-time purchase vs. subscription vs. freemium
- Whether children ever get their own login, or stay parent-managed indefinitely
- Language switcher: currently hardcoded to Czech — a real CZ/EN toggle is a
  Phase 1+ nice-to-have, not yet scheduled to a specific phase

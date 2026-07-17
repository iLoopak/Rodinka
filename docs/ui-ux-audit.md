# Rodinka — UI/UX Audit

**Type:** Audit only. No production code was changed as part of this document.

## Audit metadata and tested environment

| | |
|---|---|
| Date | 2026-07-16 |
| App version | `main` branch tip at audit time (working tree also had an unrelated in-progress `codex/fix-ios-input-zoom` fix merged) |
| Backend | Live Supabase project (`vzuxykxqlbobhgcxdmof`), not a local/mock backend |
| Test session | Signed in interactively by the app owner (test account, family "Horákovi", 2 members: a parent "Tomáš" with an account, a child "Tereza" without one). No account was created, no password was entered, and no destructive action was taken by the auditor — see [Repository inspection first](#repository-inspection-first) for why. |
| Dev server | `npm run dev` (Vite), `http://localhost:5177` |
| Browser tooling | In-app Chromium-based browser pane, DOM/accessibility-tree inspection (`read_page`) cross-checked against raw DOM (`getComputedStyle`, `getBoundingClientRect`) wherever the accessibility-tree summary looked suspicious — see [Areas that could not be verified](#areas-that-could-not-be-verified) for two tool quirks this caught |
| Viewports tested | Desktop (~956×910 pane), mobile (390×844), narrow mobile (320×700) |
| Real iOS Safari / installed PWA | Not available in this environment — see [Areas that could not be verified](#areas-that-could-not-be-verified) |

### Repository inspection first

- **Docs read:** `rodinka-roadmap.md`, `visual-identity.md`, `I18N.md`, `supabase-auth-setup.md`, `docs/OFFLINE_SHOPPING.md`.
- **Design system:** plain CSS (`src/index.css`, ~4,500 lines) with a `:root` token block (color, radius, font-size, line-height variables), no CSS framework/component library. A documented visual-identity brief (`visual-identity.md`) exists and is largely followed (Manrope type, brick/coral brand colors, module accent colors, card/button shapes).
- **Shared components:** `src/components/ui/*` (Modal, EmptyState, ErrorState, MemberAvatar, ItemTypeIcon, CompletionCheckbox, DueBadge, RealtimeStatusBadge) plus feature-specific building blocks reused across screens (e.g. `CalendarEntryRow` shared by month/week/agenda views).
- **Responsive conventions:** single-column, mobile-first "app shell" with a fixed header + `position: fixed` bottom nav + one scrollable `<main>`; `100dvh`/`100vh` fallback and `env(safe-area-inset-*)` already used throughout. An iOS-Safari input-auto-zoom fix (`--font-size-control: 1rem` in `src/index.css:53`) had just been merged before this audit — re-verified still in effect (see [Responsive and mobile findings](#responsive-and-mobile-findings)).
- **Localization:** `i18next`/`react-i18next`, typed catalogs in `src/strings.ts` (Czech-first, English second), documented in `I18N.md`. Catalog-parity is covered by an existing test (`src/i18n/i18n.test.ts`).
- **Navigation:** a small custom client-side router (`src/router.tsx`) with a fixed route list; bottom nav has 5 destinations (Dnes/Today, Kalendář/Calendar, Plánovat/Plan, Rodina/Family, Více/More); a "Plánovat" hub screen fans out to Chores/Activities/Health/Meals/Shopping; Reminders is reachable only via the header bell icon, not the bottom nav.
- **Platforms:** Vite + React 19 PWA (manifest + install banner), targeting mobile-first usage (iOS/Android browser + installed PWA) with a usable desktop layout.
- **Existing UX documentation / known issues:** no dedicated UX-issue tracker or backlog found in the repo. `rodinka-roadmap.md` records some known-incomplete areas (no real recurring-task scheduler in v1, language switcher "not yet scheduled" — actually already shipped, see UX-010) and one already-fixed item (avatar-crop save, per recent git history) that this audit does not re-report.

---

## Executive summary

The app is in solid shape for an early-stage family-organizer PWA: consistent visual language, sensible information architecture (a single "Dnes"/Today landing screen surfacing what needs attention, a "Plánovat" hub fanning out to five structured record types), working localization, decent touch-target sizing, visible keyboard-focus rings, and passing color-contrast on the core text/background token pairs. The July 2026 iOS input-zoom fix is holding under every screen and viewport re-tested here.

The most consequential problem is not a UI defect at all: a **Supabase Realtime subscription bug in the recently-merged "Introduce Supabase Realtime across the app" change fires on every page load**, makes the shopping list briefly (and sometimes not-so-briefly) render as empty when it isn't, and — on the Shopping screen's own retry control — leaks a raw internal exception string (including a live family UUID) directly into product UI. This is squarely a data-trust and "exposes implementation details instead of user intent" problem and should be fixed before anything else in this report.

Beyond that, the issues found are the kind expected at this stage of a growing app: a few inconsistent interaction patterns between sibling screens (filter visibility, primary-action placement), a couple of accessibility gaps that are easy to miss without assistive-tech testing (unlocalized ARIA labels in one calendar view, a redundant reassignment control, a narrow-viewport tab row with no scroll affordance), one broken CSS custom property, and one navigation dead-end on the flagship Today dashboard. None of the UI issues found are launch-blocking on their own; the realtime bug is.

**11 findings total: 1 High, 5 Medium, 5 Low. No Critical findings.**

---

## Summary table

| ID | Severity | Area | Finding | Recommended action |
|---|---|---|---|---|
| UX-001 | High | Shopping sync (Today + Shopping screen) | Realtime subscription throws on every mount; shopping list briefly/misleadingly shows as empty, and the Shopping screen's retry control shows a raw internal exception string (incl. a family UUID) instead of a user-facing message | Fix the underlying subscribe/unsubscribe race in the shopping realtime channel; give the Today widget a real "sync problem" state instead of treating `items:[]` as "empty"; replace the raw error string shown to users with a translated, generic message |
| UX-002 | Medium | Today dashboard → Chores | "Doplnit" on a quick task navigates to `/chores` and leaves the user there after closing the edit modal, breaking Today's in-place-triage model | Keep the quick-edit interaction on the Today screen (inline expand or a modal that returns to `/`), or make the cross-screen jump an explicit, reversible "open in Chores" affordance |
| UX-003 | Medium | Today dashboard → "Vyžaduje pozornost" | Recurring overdue chores render "Úkol je po termínu · Po termínu" — the word "overdue" doubled, with no actual date | Ensure `buildTodayAttentionItems` resolves a real date for recurring chores, or give the reason strings a distinct fallback that doesn't repeat the leading phrase |
| UX-004 | Medium | Calendar → month view | Day cells expose raw, unlocalized `aria-label`s (e.g. `"2026-07-14 — 1"`) to assistive tech, unlike the week/agenda views of the same data | Localize the month-grid `aria-label` to match the week view's spoken-date + counted-items pattern |
| UX-005 | Medium | Reminders | `.reminder-meta` uses an undefined `--ink-faint` CSS variable, silently falling back to full-strength text color and flattening the intended title/meta visual hierarchy | Define `--ink-faint` in `:root` (or point the rule at an existing muted token) |
| UX-006 | Medium | Shared `.tabs` component (Activities, Chores, Health, Meals) | Horizontally-scrollable tab rows have no scroll affordance and clip the last tab flush at 320px width, reading as truncated/broken rather than "swipe for more" | Add a visible scroll cue (edge fade, partial-tab peek, or a scroll indicator) to the shared `.tabs` pattern |
| UX-007 | Low | Cross-screen consistency (Calendar vs. Activities/Health) | Calendar hides its filters behind a "Zobrazit filtry" toggle; Activities and Health show the same kind of filters inline, always | Pick one disclosure pattern for list filters and apply it consistently across the Plánovat section |
| UX-008 | Low | Global header | The notification-bell touch target measures 42×42px, just under the common 44×44 minimum, in a top-corner mis-tap-prone position | Bump the bell's hit area to at least 44×44 |
| UX-009 | Low | Meals → "Plán" tab | No persistent top-of-screen "+ Add" action, unlike every sibling Plan-area screen (including Meals' own "Jídla" tab) | Add a consistent header-level add action, or intentionally document why Meals-Plan is the exception |
| UX-010 | Low | Family → member profile | The per-member color picker reuses the same palette tokens (`sky`, `sage`, `honey`, `lavender`, `berry`) as the module-accent system, which `visual-identity.md` explicitly says must stay a separate system | Give member colors their own palette, distinct from module accents |
| UX-011 | Low | Calendar → week/agenda rows | The per-occurrence "reassign" control repeats the same avatar/name already shown on the row with no distinguishing cue, while a nearby line of code already suppresses the equivalent text-label duplication | Apply the same "skip if participant === responsible" guard to the assignment-button avatar, or visually differentiate the control |

---

## Top-priority findings

### UX-001 — Shopping realtime subscription throws on every mount; misleading empty state and leaked error text
**Severity:** High
**Screens/workflow:** Today dashboard shopping widget (`/`), Shopping screen (`/shopping`) — affects every app load.
**Status:** Directly observed and reproduced twice; root cause is a code-level hypothesis (see below), not fully proven.

**What happens:** On every mount of the shopping data provider (fresh sign-in, and reproduced again on a later reload), the browser console logs:
```
Failed to initialize offline shopping: Error: cannot add `postgres_changes` callbacks for
realtime:family:<id>:shopping after `subscribe()`.
  at RealtimeChannel.on (@supabase/supabase-js)
  at ShoppingRepository.subscribeToShoppingRealtime [as realtime] (src/shopping/shoppingRealtime.ts:3)
  at ShoppingRepository.start (src/shopping/shoppingRepository.ts:70)
```
`useShoppingDataSource.ts:58-61` catches this, sets `status: 'error'`, but forces `ready: true` while `items` stays `[]` (the throw happens before the server sync at `shoppingRepository.ts:113` ever runs).

**Directly observed impact:**
- On the Today dashboard, the shopping widget read "0 položek k nákupu / Nákupní seznam je prázdný." (empty) immediately after sign-in. After navigating away and back, the *same* list showed "8 položek k nákupu" with real items (sýr, jablka, Brambory, …). Same underlying data, two contradictory renders in one session — `TodayShoppingWidget.tsx` never receives `shoppingSyncStatus`/`shoppingSyncError` at all, so it has no way to distinguish "genuinely empty" from "failed to load."
- On the Shopping screen itself, a visible red "Synchronizace se nezdařila." banner with a "Zkusit znovu" retry link does appear (`ShoppingScreen.tsx:143-156`) — so this screen is at least honest about the failure. But the retry button's tooltip/accessible-name (`title={shoppingSyncError}`) is the **raw exception text verbatim**, including a live family UUID and internal channel-naming details — a direct example of the interface exposing implementation details instead of user intent.

**Root-cause hypothesis (unverified):** `shoppingRealtime.ts` opens a fresh `supabase.channel('family:<id>:shopping').on(...).subscribe()` on every mount; `shoppingRepository.stop()` removes the old channel without awaiting the removal. Under a fast mount→cleanup→mount cycle, the new `.channel()` call for the same topic appears to receive the not-yet-fully-removed (already-subscribed) channel object, so the second `.on()` is rejected by supabase-js. Not confirmed against a production (non-dev) build.

**Why it matters:** this directly undermines the reliability story documented in `docs/OFFLINE_SHOPPING.md` ("local source of truth," idempotent sync) — a user glancing at Today has no reason to doubt an incorrect "empty" list, and the one screen that does show an error surfaces developer-facing text instead of a real message.

**Recommended direction:** fix the subscribe/unsubscribe race (e.g. await channel removal before re-subscribing, or reuse/guard the channel instance across remounts); pass sync status into the Today widget so it can show a distinct "couldn't load, tap to retry" state instead of a bare empty state; never render a raw `Error.message` / stack text in end-user-facing copy — map it to a translated generic message and keep the raw detail in logs only.

---

### UX-002 — "Doplnit" on Today's quick-task list leaves the user stranded on a different screen
**Severity:** Medium
**Screen/workflow:** Today dashboard (`/`) → "Rychlé úkoly" (quick tasks) → "Doplnit" per item.
**Status:** Directly observed and reproduced.

Clicking "Doplnit" next to any quick task navigates to `/chores?chore=<id>&edit=1` and opens the "Upravit úkol" edit modal on top of the full Chores screen. Closing the modal leaves the user on `/chores`, not back on `/` (confirmed via `window.location.pathname`).

Every other primary interaction on the Today dashboard stays in place: the hero "+ Přidat" button opens a modal over Today; completing a quick task updates the list in place with an undo affordance; opening a calendar entry opens a modal over Today; adding a shopping item stays on Today. "Doplnit" is the one action that silently relocates the user to a different bottom-nav tab with no way back except manual navigation — breaking the dashboard's implicit promise of fast, in-context triage.

**Recommended direction:** either keep the "fill in more detail" interaction on the Today screen itself (inline expand, or a modal that closes back to `/`), or make the cross-screen jump an explicit, clearly-labeled "open in Chores" action rather than what currently reads as an inline edit.

**Files:** `src/components/TodayDashboard.tsx:110-116`, `src/components/today/TodayQuickTodoWidget.tsx`.

---

### UX-003 — Duplicated "overdue" wording for recurring chores ("Úkol je po termínu · Po termínu")
**Severity:** Medium
**Screen/workflow:** Today dashboard → "Vyžaduje pozornost".
**Status:** Directly observed and reproduced (seed data: a weekly recurring chore, "E2E týdenní").

The attention card's reason line reads **"Úkol je po termínu · Po termínu"** — the fallback literal for "no date available" (`t.due.overdue`, i.e. "Po termínu") gets interpolated into a template that already says "je po termínu" ("is overdue"), because `item.date` was empty for this recurring chore. `TodayAttentionList.tsx:14-28` does this for chores, payments, and medical reasons alike whenever their `date` is unresolved.

**Why it matters:** reads as a visible copy/interpolation bug to any user, precisely on the recurring-task case where knowing *which* overdue date is being talked about matters most.

**Recommended direction:** resolve a real due date for recurring chores in `buildTodayAttentionItems`, and/or give the reason builders a fallback phrase that doesn't repeat "overdue" when no date is available.

**Files:** `src/components/today/TodayAttentionList.tsx:14-28`, `src/strings.ts:168-170,240,1284-1286,1356`.

---

### UX-004 — Calendar month view exposes raw, unlocalized ARIA labels
**Severity:** Medium (Accessibility)
**Screen/workflow:** Calendar → Měsíc (month) view.
**Status:** Directly observed via accessibility-tree inspection, cross-checked against DOM.

Day-of-month buttons carry `aria-label="2026-07-14 — 1"` — a raw ISO date string plus a bare, unlabeled count (`MonthGrid.tsx:66`). The same screen's Týden (week) and Přehled (agenda) views, showing the *same underlying data*, build proper localized labels for the equivalent day headers (e.g. "úterý 14. července, 1 položka" — confirmed live).

**Why it matters:** a screen-reader user navigating the month grid hears "2026 dash 07 dash 14 dash 1" for every day, instead of a spoken weekday/date and a described count — a materially worse experience than the other two views of the exact same feature, and internally inconsistent.

**Recommended direction:** build the month-grid `aria-label` with the same localized weekday/date + counted-items pattern already used by the week view.

**Files:** `src/components/calendar/MonthGrid.tsx:66`.

---

### UX-005 — Undefined `--ink-faint` CSS variable flattens the Reminders meta-text hierarchy
**Severity:** Medium
**Screen/workflow:** Reminders (`/reminders`), every card's secondary meta line.
**Status:** Directly observed and confirmed via `getComputedStyle`.

`.reminder-meta { color: var(--ink-faint); ... }` (`index.css:1068`) is the only reference to `--ink-faint` in the entire stylesheet, and `--ink-faint` is never defined in `:root`. An undefined custom property makes the `var()` reference invalid, so the whole `color` declaration is dropped and the element falls back to its inherited color. Confirmed: the meta line computes to `rgb(38, 51, 59)` — exactly `--ink`, the app's primary/darkest text color, identical to the card's own title text.

Visibly, in a live screenshot of `/reminders`, the meta captions ("Důležité · Úkoly", "Úkoly", "Jídlo") render as dark as the headline above them, with only font size still separating the two levels — directly undermining the intended visual hierarchy.

**Recommended direction:** define `--ink-faint` in `:root` alongside `--ink`/`--ink-muted`, or repoint `.reminder-meta` at an existing muted token.

**Files:** `src/index.css:1068`, `src/index.css:1-63` (`:root`).

---

## Findings grouped by screen or workflow

### Today dashboard (`/`)
- UX-001 (shopping widget empty-state symptom), UX-002, UX-003. See above for detail.
- Positive notes: the hero "+ Přidat" universal-create modal, quick-task add/complete-with-undo, and shopping quick-add all stay in place on Today — a good, consistent in-context interaction model that UX-002 is the lone exception to.

### Calendar (`/calendar`)
- UX-004 (month-view ARIA labels), UX-011 (redundant reassignment avatar in week/agenda rows), UX-007 (filters hidden behind a toggle, unlike sibling screens).
- Positive notes: month/week/agenda views share data cleanly; the per-day detail panel (recurrence text, per-occurrence reassignment, quick "Přidat na tento den") is a well-thought-out pattern once its ARIA labeling (UX-004) is fixed.

### Plan hub (`/plan`)
- No standalone defects found. Card layout, per-module accent color, and count summaries are consistent and legible. (See UX-010 for a related, Family-screen finding about the same accent palette.)

### Chores (`/chores`)
- Shares UX-006 (tab-row scroll affordance) via the four tabs (Aktivní/Čeká na schválení/Kapesné/Správa).
- Positive notes: drag-to-prioritize quick tasks with a clear hint ("Přetažením nastavíte prioritu. Prvních pět se zobrazuje na Dnes.") ties directly and legibly back to the Today dashboard's preview-limit behavior — a good discoverability pattern.

### Activities (`/activities`)
- UX-007 (always-visible filters vs. Calendar's toggle), UX-006 (tab-row clipping at 320px, directly reproduced here).

### Health (`/health`)
- UX-007 (same filter-visibility inconsistency); shares the UX-006 tab-row risk (not independently re-verified but same shared component).

### Meals (`/meals`)
- UX-009 (missing persistent add action on the "Plán" tab).

### Shopping (`/shopping`)
- UX-001 (full detail above — this is the screen with the visible error banner and leaked exception text).
- Positive notes: sync-status banner, retry action, and an "options" disclosure panel (common items, previous purchases, section editing, responsible-person filter) are otherwise a clean, well-organized progressive-disclosure pattern.

### Family (`/family`)
- UX-010 (member color picker reuses module-accent tokens).
- Positive notes: member list, add-child, and invite-parent actions are clear and minimal; avatar upload/crop worked without incident in this pass.

### More / Settings (`/more`)
- No defects found in this pass. Language switch (Čeština ⇄ English) applied instantly and updated `<html lang>` correctly, matching `I18N.md`. Account, family-name, family-photo, and password-set entry points are clearly grouped.

### Reminders (`/reminders`)
- UX-005 (undefined `--ink-faint`). Otherwise a clear, well-grouped (overdue/today/upcoming) list with sensible per-item actions ("Označit jako přečtené", plus "Skrýt" where applicable).

---

## Cross-application consistency issues

- **Filter disclosure pattern** (UX-007): Calendar hides filters behind a toggle; Activities and Health show the same kind of filter row inline, always. Chores' "Správa" tab and Meals' "Jídla" tab also show inline filters/search — so Calendar is the outlier, not the other way around.
- **Primary "+ Add" action placement** (UX-009): every Plan-area screen has one stable, top-of-screen "+ Přidat …" button *except* Meals' "Plán" tab.
- **Avatar/name redundancy pattern applied inconsistently** (UX-011): `CalendarEntryRow.tsx` already contains logic to suppress a duplicate text label when the participant and the responsible member are the same person, but the equivalent avatar-based reassignment control right next to it has no such guard — the same de-duplication intent, applied to only half of the row.
- **Color-token reuse across two documented-as-separate systems** (UX-010): module accent colors and member colors now share one palette, contrary to `visual-identity.md`.
- Icon system, card shapes, button styles (primary red-brick / secondary bordered), and modal-sheet behavior were consistent everywhere visited — no defects found there.

---

## Responsive and mobile findings

Tested at 390×844 (common mobile) and 320×700 (narrow mobile), in addition to the default desktop pane width.

- **No horizontal page overflow** at either width on the screens spot-checked (Today, Activities; `document.documentElement.scrollWidth === clientWidth` confirmed via script on both).
- **Touch targets:** quick-add submit, quick-task checkbox, and the "Doplnit" link on Today all measure at least 44×44px (Apple's floor). The header notification-bell link measures **42×42px** (UX-008) — a small but measurable shortfall, in a corner position next to the family name where an accidental tap is easy on a real notched phone.
- **UX-006 — shared `.tabs` component has no scroll affordance at 320px.** On `/activities`, the third tab ("Pozastavené a ukončené") is clipped flush at the container edge with no fade, shadow, or partial-tab peek to signal that the row scrolls. Confirmed the row *is* scrollable (`scrollWidth` 400 vs. `clientWidth` 292), so no content is actually lost — but visually/interactively it reads as truncated or broken. This is a shared CSS class (`index.css:1430-1436`) reused by Chores, Health, and Meals tab rows, so the same risk likely applies wherever a screen has 3+ tabs on a narrow phone (not independently re-verified on each of those screens).
- **iOS input-zoom fix regression check:** re-verified the July 2026 fix (`--font-size-control: 1rem`, `index.css:53`) still holds — the Add Activity form's title input computes `font-size: 16px` at 320px width. No regression found.
- The Add Activity modal sheet fills the viewport exactly at 320×700 with no overflow.
- Real iOS Safari and installed-PWA standalone mode were not available in this environment — see below.

---

## Accessibility findings

- UX-004 (month-view raw ISO `aria-label`s) and UX-011 (redundant, undifferentiated reassignment control) are the two accessibility-specific findings from this pass; both detailed above.
- UX-008 (bell touch target) has an accessibility dimension (motor-impairment tap precision) alongside its general usability one.
- **Passed checks:**
  - Keyboard focus visibility: tabbing through the Today dashboard produces a clear `outline: 3px solid rgba(185,71,66,0.28)` ring (`index.css:3407`) on every interactive element reached.
  - Color contrast: computed the core token pairs against WCAG's formula — `--ink` on `--canvas` 11.97:1, `--ink-muted` on `--canvas` 4.63:1, `--ink-muted` on `--paper` 4.94:1, `--brick` on `--paper` 5.11:1, white on `--brick` 5.19:1 — all pass AA for normal text (≥4.5:1).
  - The one meaningful `<img>` found on the screens visited (the Today dashboard's optional family hero photo) is correctly marked `alt=""` with `aria-hidden="true"` (decorative; the adjacent text already conveys the information).
  - Tab lists use `role="tablist"`/`role="tab"` correctly where checked (Calendar, Chores, Health, Meals).
- **Tooling caveat:** this pass used DOM/accessibility-tree inspection, not a real screen reader (VoiceOver/NVDA/TalkBack). Two apparent issues surfaced by the accessibility-tree summary turned out to be tool artifacts once cross-checked against raw DOM (`title` attribute outranking visible text content in the tool's own name computation; single/double-character text nodes being dropped from the tree) — both are noted in [Areas that could not be verified](#areas-that-could-not-be-verified) rather than reported as findings, since they did not reproduce against the actual DOM/CSS the browser would expose to real assistive technology.

---

## Recommended implementation waves

**Wave 1 — blockers and serious usability defects**
- UX-001 (Shopping realtime subscription bug + leaked error text)

**Wave 2 — consistency and workflow simplification**
- UX-002 (Doplnit navigation dead-end)
- UX-003 (duplicated "overdue" text)
- UX-006 (tab-row scroll affordance)
- UX-007 (filter-visibility consistency)
- UX-009 (Meals Plán missing add action)

**Wave 3 — accessibility and responsive refinements**
- UX-004 (month-view ARIA labels)
- UX-005 (undefined `--ink-faint`)
- UX-008 (bell touch target)
- UX-011 (redundant reassignment control)

**Wave 4 — lower-priority polish**
- UX-010 (member-color/module-accent palette overlap)

---

## Areas that could not be verified

- **Onboarding / new-family creation / join-by-invite-code flow** — the test session started already signed into an existing family; creating a brand-new family or joining one via invite code was not exercised.
- **Sign-up (account creation) and Google OAuth sign-in** — not performed. Creating accounts and entering credentials on the user's behalf falls outside what this session is permitted to do regardless of task framing; the user signed in manually instead, so only the already-authenticated app surface was audited. The sign-in/sign-up form's own layout, tab-switch, and inline validation states (empty fields, invalid email, short password, mismatched confirm-password) were reviewed from source (`AuthScreen.tsx`) but not exercised live.
- **Destructive actions and their confirmations** — `MemberRemovalDialog.tsx` exists in the codebase but removing a real family member was not performed (would alter the account's real data). Chore/activity/meal deletion and archive flows were viewed but not exhaustively exercised end-to-end.
- **"Nastavit heslo" (set password) and "Připomínky a oznámení" (push-notification settings) sub-screens** — reachable and briefly noted from `/more`, but not opened/exercised in this pass.
- **Full form submission round-trips** for Add Activity, Add Medical Record, Add Meal, Create Voting Round, Allowance payout — screens and field sets were reviewed, but not every form was submitted end-to-end with real data.
- **Landscape orientation** — not explicitly tested (only portrait-equivalent viewport widths were used).
- **Real iOS Safari and installed-PWA standalone mode** — this environment provides a Chromium-based browser pane only; iOS-specific rendering quirks (safe-area insets, keyboard-open viewport behavior, standalone-mode chrome) could not be verified on real WebKit. The iOS input-zoom fix was re-verified at the CSS/computed-style level (16px font-size holds) but not on a physical device.
- **Real assistive technology** (VoiceOver/NVDA/TalkBack) — accessibility findings are based on DOM/accessibility-tree inspection and manual cross-checks, not a live screen-reader pass. Two tool-level false positives were caught and excluded (see [Accessibility findings](#accessibility-findings)); it's possible other, real AT-specific issues exist that this method would not surface.
- **Production (non-StrictMode-dev) build behavior for UX-001** — the realtime-subscription race is a code-level hypothesis based on dev-server behavior; whether it reproduces identically in a production build was not verified.

---

## Appendix: routes, viewports, and checks performed

**Routes exercised** (from `src/router.tsx`): `/`, `/calendar`, `/plan`, `/chores`, `/activities`, `/health`, `/meals`, `/shopping`, `/family`, `/more`, `/reminders`.

**Viewports:** desktop (~956×910 browser-pane default), 390×844 (mobile), 320×700 (narrow mobile).

**Checks performed per area:**
- Screenshot + accessibility-tree (`read_page`) capture on first visit to every route above.
- At least one primary interaction exercised per screen (add/edit modal open, tab switch, filter panel toggle, quick-add submit, language switch, day selection in each calendar view).
- Console-error and network-request monitoring active throughout (surfaced UX-001).
- `getComputedStyle`/`getBoundingClientRect` spot checks for: font-size (iOS zoom regression), touch-target dimensions, horizontal overflow (`scrollWidth` vs. `clientWidth`), CSS custom-property resolution (`--ink-faint`), and WCAG contrast ratios on core token pairs.
- Keyboard-Tab focus-visibility check on the Today dashboard.
- Automated test suite (`npm run test`) was **not** re-run as part of this audit (no code changes were made); existing tests were referenced only to understand intended contracts (e.g. `appShellLayoutContract.test.ts`, `activityFormContract.test.ts`).

**Verification before finishing:**
- All 11 routes/screens listed above were reached and reviewed.
- Findings were checked against each other for overlap; none are duplicates (UX-002/UX-003 both touch Today's attention/quick-task areas but describe distinct, independently-reproducible defects).
- Each severity was assigned based on directly observed, reproduced evidence except where explicitly marked as a code-level hypothesis (UX-001's root cause) — no finding above Low severity rests solely on speculation.
- This file renders as standard Markdown (tables, fenced code block, headings) with no unclosed formatting.

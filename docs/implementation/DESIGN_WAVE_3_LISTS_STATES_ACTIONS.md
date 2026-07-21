# Design Wave 3 — Cards, ListRow, StatusPill, sdílené stavy a destruktivní akce

Brief: [`docs/audits/p1/13_DESIGN_WAVE_LISTS_STATES_ACTIONS.md`](../audits/p1/13_DESIGN_WAVE_LISTS_STATES_ACTIONS.md)

## Nejdřív hranice ověření — čti to

Jako u Wavy 2: reálné screenshoty a iOS chování v tomhle prostředí spolehlivě
ověřit nejde (headless renderer zde screenshot nezachytí — timeoutuje, stejné
omezení, jaké dokumentovala Wave 2). Co ověřit **šlo**:

| Kritérium | Stav |
| --- | --- |
| Semantika primitiv (button/link row, aria-pressed, role/live) | ✅ **testy** (`listStatePrimitiveContract`, 15 testů) |
| CSS se reálně aplikuje (tón, layout, reset button chrome) | ✅ **ověřeno v běžícím dev serveru** (computed styles) |
| Offline ≠ permission ≠ degraded ≠ error | ✅ **ověřeno** — tři různé barvy ikony + různý glyph + různá role |
| Vizuální posouzení (jak to vypadá na obrazovce) | ⚠️ **jen computed/DOM**, ne screenshot |
| iOS keyboard / safe area | — mimo scope téhle vlny |

Konkrétně naměřené (dev server, 375×812) — každý stav dostal jinou barvu ikony:
offline `rgb(55,108,121)` (info/teal), permission `rgb(156,62,62)` (danger),
degraded `rgb(122,89,0)` (warning). To je přímý důkaz akceptačního kritéria
„offline nesmí vypadat jako permission error".

## Výchozí stav

Řádky a stavy byly roztroušené:

- **Řádky** psaly ploché `.section-list li` s `row-title` / `row-meta` /
  `row-description` / `row-spacer` a badge/tlačítka umístěné ad-hoc spacerem.
- **Status** existoval ve třech spellingách: `.badge-*` (pending/done/overdue…),
  `.status-pill` (reminder push panel) a inline.
- **Stavy** byly `<p class="loading">`, `<p class="empty-state">`, `ErrorState`
  (červená karta) a `EmptyState` (family mark) — ale **offline, degraded a
  permission neměly vlastní primitivum** a snadno splynuly s generic errorem.

## Co přibylo

### `StatusPill` (`src/components/ui/StatusPill.tsx`)

Tóny `neutral | info | success | warning | danger | pending`. Každý tón nese
**barvu i glyph** — status není nikdy sdělen jen barvou (text label je povinný
typem, ikona je druhý kanál). Staví na existující `.status-pill` bázi a přidává
`--tone` modifikátory, takže konsoliduje `.badge-*` na jednu implementaci místo
paralelní. Legacy `.status-pill` v reminder panelu zůstává nedotčený.

### `Card` + `InteractiveCard` (`src/components/ui/Card.tsx`)

Varianty `standard | interactive | selected | muted | warning | danger`. Status
žije ve variantě, **ne** v levém barevném borderu (audit žádal ho retire).
Member accent je opt-in přes `--card-accent` a použitý cíleně, ne jako plošné
status řešení. `InteractiveCard` renderuje reálný `<button>` s `aria-pressed` —
žádné ruční `role`/`tabIndex`/`onKeyDown`.

### `ListRow` + `NavigationRow` + `SelectableRow` (`src/components/ui/ListRow.tsx`)

Composition API — pět slotů `leading / title / meta / description / trailing`,
**žádné feature-specific boolean props**. Specializované chování je ve
wrapperech, ne ve flagách na jednom komponentu:

- `ListRow` — čistý presentational shell (div), pro editable/summary řádky s
  vlastními vnitřními controly v `trailing`.
- `NavigationRow` — celý řádek je tap target: reálný `<button>` (nebo `<a>` při
  `href`) + chevron. Keyboard aktivace je nativní.
- `SelectableRow` — `<button>` s `aria-pressed`, výběr není jen barva.

### `StateView` (`src/components/ui/StateView.tsx`)

Jeden slovník pro **všechny** non-content stavy: `loading | skeleton | empty |
noResults | error | offline | degraded | permissionDenied | endOfList`. Jedna
tabulka `VARIANTS` drží rozdíly na jednom místě (ikona, tón, live-region
politeness), takže offline se **nemůže** omylem tvářit jako permission error.

Každý stav má: title → vysvětlení → volitelná akce → volitelný **dev-only**
technical detail (gated `import.meta.env.DEV`, nikdy neodejde do produkce).
Akce je awaited a **blokuje double submit** (interní `busy`). Default copy žije
ve sdíleném `t.states` (cs + en).

## Migrace — Chores

Vědomě **jedna reprezentativní oblast** (brief: „nemigruj všechny features
v jednom PR"), oblast #1 ze seznamu:

- `ChoreList` řádky → `ListRow` (leading = checkbox + avatar, title/meta/
  description sloty, trailing = DueBadge + částka + `StatusPill pending` + Open).
- `ChoreList` prázdný stav → `StateView variant="empty"`.
- `ChoresScreen` loading → `StateView variant="loading"`.
- `ChoresScreen` error → `StateView variant="error"` s retry akcí a dev
  technical detailem.

Pending badge (`.badge-pending`) → `StatusPill tone="pending"` — ukázka
konsolidace status vokabuláře.

## Destruktivní akce

Primitiva z předchozích vln (`ConfirmDestructiveActionDialog`,
`RecurringDeleteScopeDialog`, `DestructiveIconButton`, `UndoToast`,
`ArchivedItemBadge` v `src/components/ui/DestructiveActions.tsx`) už kontrakt
briefu splňují a **nebyla přepisována**:

- co se smaže → `objectName` + `explanation`,
- scope occurrence vs. série → `RecurringDeleteScopeDialog` (single/following/series),
- co se zachová / vratnost → `consequences` list + `explanation` (copy),
- double submit → `busy` disabluje oba buttony.

Sjednocení copy „zda je akce vratná" napříč konzumenty je copy práce pro
migraci jednotlivých features, ne strukturální mezera.

## Odchylky a co zbývá

- **Nemigroval jsem shopping / family / reminders / activities řádky.** Brief je
  vyjmenovává jako reprezentativní, ale zároveň zakazuje překročit čitelnou
  změnu. `ListRow`/`Card`/`StatusPill`/`StateView` jsou připravené; jejich
  adopce po jednom je navazující krok.
- **`EmptyState` a `ErrorState` zůstaly.** `EmptyState` nese feature artwork
  (family mark — brief: „neměnit feature-specific artwork"). `ErrorState` má 17
  dalších konzumentů; plošná záměna jejich vizuálu bez screenshotu je přesně to
  riziko, před kterým QA sekce varuje. `StateView` je nový, bohatší slovník;
  staré dvě se do něj mají vlévat postupně.
- **`Card`/`SelectableRow`/`NavigationRow` zatím nemají produkčního konzumenta**
  mimo testy — API a CSS jsou ověřitelné, adopce následuje s migrací dalších
  obrazovek.
- **Screenshot / iOS** — viz hranice nahoře.

## Guard

`src/listStatePrimitiveContract.test.tsx` (15 testů): StatusPill text-ne-jen-barva
+ volitelné vypnutí ikony; ListRow sloty + že je to `div` (hostí vnitřní
buttony); NavigationRow renderuje reálný button/anchor + keyboard aktivace +
disabled; SelectableRow `aria-pressed`; Card varianty + InteractiveCard button
s `aria-pressed`; StateView diferenciace (4 různé class sety, alert vs. status,
end-of-list bez akce), double-submit prevence, dev-only technical detail.

`cssArchitectureContract` rozšířen o `card.css`, `list-row.css`,
`status-pill.css`, `state-view.css` v sanctioned listu.

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `tsc -b` | ✅ bez chyb |
| `npm run lint` | ✅ 0 chyb (jen preexistující warningy) |
| `npm test` | ✅ 231 souborů, 1428 testů |
| `npm run build` | ✅ včetně bundle guardu |
| Browser QA | ⚠️ **computed styles + DOM** (dev server), ne screenshot |

Bundle: eager gzip rozpočet nudgnut 234 000 → 235 000 B. Důvod: sdílený
`StateView` slovník posílá default copy v **vždy-eager** `strings.ts`; naměřeno
234 250 B po záměrně stručné copy. Zdokumentováno v `scripts/check-route-chunks.mjs`.

## Pro další design vlny

- Migrace shopping / family / reminders / activities řádků na `ListRow` +
  `StatusPill`.
- Adopce `Card` / `NavigationRow` / `SelectableRow` na obrazovkách, kde je celý
  řádek/karta tap target.
- Vlévání `ErrorState` a `EmptyState` do `StateView` (po vizuálním ověření).
- Nasazení `StateView offline / degraded / permissionDenied` na reálné offline a
  permission cesty (dnes jen `t.offline` ad-hoc).
- Screenshot pass a iOS průchod (Wave 4 / reálné zařízení).

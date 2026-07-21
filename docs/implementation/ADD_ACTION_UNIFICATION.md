# App-wide "Přidat" akce — sjednocení

Audit: [`docs/audits/ADD_ACTION_CONSISTENCY_AUDIT.md`](../audits/ADD_ACTION_CONSISTENCY_AUDIT.md)
Navazuje na: [Design Wave 1](./DESIGN_WAVE_1_HEADERS_TOOLBARS_FILTERS.md) (`Button`/`IconButton`, `.header-actions .btn`)

## Co přibylo

`src/components/ui/AddAction.tsx` — tři pojmenované komponenty, brief požadoval přesně tuhle sadu:

- **`AppPrimaryAddButton`** — Varianta A. Hlavní CTA obrazovky/prázdného stavu (Dnes hero, Dnes prázdný program, `EmptyState` s `variant: 'primary'`).
- **`AppToolbarAddButton`** — Varianta B. Akce v hlavičce sekce (`ScreenHeader actions`, `tab-toolbar`, sub-nadpis jako "Naplánovat pro člena").
- **`AddActionIcon`** — icon-only varianta B pro hlavičku, kde není místo na text (Kalendář). `aria-label` je vyžadovaný typem, ne konvencí.

Všechny tři jsou tenké wrappery nad `Button`/`IconButton` z Wave 1 (`variant="primary"`, `leadingIcon="+"`) — žádný nový vizuální jazyk, jen jméno, které říká, kam patří. `AddAction.tsx` je jediný soubor, který smí sáhnout na `leadingIcon="+"` nebo vykreslit bare `+` do `IconButton` přímo; to hlídá `addActionContract.test.ts`.

`EmptyState` dostal `action.variant?: 'primary' | 'secondary'` (default `'secondary'`, beze změny chování pro stávající konzumenty). `'primary'` znamená "tohle je založ první záznam" a vykreslí `AppPrimaryAddButton`; zbytek (zkusit znovu, vyčistit filtry, upravit) zůstává neutrální `btn-secondary`, aby nesoutěžil o pozornost s opravdovou create akcí.

## Migrovaná místa

Header/toolbar (Varianta B), `<Button leadingIcon="+">` → `AppToolbarAddButton`:
Kalendář (icon-only → `AddActionIcon`), Úkoly, Aktivity, Zdraví, Nákupy, Knihovna jídel, Plán jídel, Hlasování, Plánovač, Rodina (přidat dítě), Chat (nová konverzace — dřív `btn-secondary` bez "+"), Rodina → profil člena → 3 shortcuty "Naplánovat …" (dřív `btn-secondary`).

Screen/empty-state CTA (Varianta A), hand-rolled → `AppPrimaryAddButton`:
Dnes hero (`hero-action-button` — býval kulaté FAB s barevným stínem), Dnes prázdný program (`link today-program-empty-action` — býval čistě textový odkaz), `EmptyState` create akce v Knihovně jídel, Hlasování a Chatu (prázdná konverzace).

Odstraněné CSS overridy, které dělaly z primárního tlačítka něco jiného:

- `.planner-create-button` (`src/index.css`) — přebarvoval `variant="primary"` na `paper-raised` pozadí s brick textem a jemným stínem; smazáno beze zbytku, Plánovač teď vypadá jako Úkoly/Aktivity/Zdraví.
- `.hero-action-button` — zbyl jen `flex: 0 0 auto` (layout); `border-radius: 999px` + barevný `box-shadow` (FAB tvar) pryč.
- `button.today-program-empty-action` — zbyl layout (velikost, padding v tomhle kompaktním řádku); `link`/textová podoba pryč, teď dědí plné pozadí z `.btn-primary`.
- `.messages-new-button` (`messages.css`) — smazáno celé; sedí v `.header-actions`, takže `.header-actions .btn` (Wave 1) už řeší velikost sám.

## Guard

`src/addActionContract.test.ts`:

- žádný soubor mimo `AddAction.tsx` nepíše `leadingIcon="+"` ani bare `+` do `IconButton`,
- staré zápisy (`hero-action-button` jako bare button, `link today-program-empty-action`, `btn-secondary messages-new-button`, `btn-secondary` shortcuty v profilu člena) se nesmí objevit znovu,
- `EmptyState` má `variant` rozlišení a používá `AppPrimaryAddButton`,
- icon-only add trigger vyžaduje `aria-label`.

`calendarFilterContract.test.ts` upraven (hledal `<IconButton`, teď `<AddActionIcon`) — pořadí akcí v hlavičce (+ / Dnes / Filtry) beze změny.

## Co zůstalo mimo rozsah a proč

Viz audit, sekce "Co zůstává mimo rozsah". Krátce: rychlá vstupní pole (jiný vzor — text + submit, ne tlačítko vedle nadpisu), řádkové/vnořené "přidat" odkazy uvnitř existujícího obsahu (kalendářní den, "přidat další jídlo", ingredience), pozvání rodiče, založení dětského účtu, odeslání zprávy a menu přílohy v Composeru. Tyhle akce buď nejsou "založ nový záznam" ve smyslu briefu, nebo je jejich zápis (jedna instance vs. desítky opakovaných řádků) jiný problém než sjednocení dvou CTA variant.

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `tsc -b` | ✅ bez chyb |
| `npm run lint` | ✅ 0 chyb (jen preexistující warningy) |
| `npm test` | ✅ 241 souborů, 1487 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| Vizuální průchod v prohlížeči | ⚠️ neproběhl — stejné omezení prostředí jako u předchozích vln (viz `DESIGN_SYSTEM_UX_CONSISTENCY_AUDIT.md` §0). CSS změny jsou zdůvodněné diffem (odstranění barvy/radius/stínu z primárního tlačítka), ne odhadnuté. |

# Design Wave 1 — ScreenHeader, toolbar, buttons a filters

Brief: [`docs/audits/p1/11_DESIGN_WAVE_HEADERS_TOOLBARS_FILTERS.md`](../audits/p1/11_DESIGN_WAVE_HEADERS_TOOLBARS_FILTERS.md)
Audit: [`docs/audits/DESIGN_SYSTEM_UX_CONSISTENCY_AUDIT.md`](../audits/DESIGN_SYSTEM_UX_CONSISTENCY_AUDIT.md)

## Výchozí stav byl lepší, než brief čekal

Dvě z pěti primitiv už existovala a fungovala dobře:

- **`ScreenHeader`** — používalo ho 10 z 11 obrazovek. Jediný straggler byl `PlannerScreen` s ručním `.screen-header` markupem.
- **`FilterDisclosureToggle`** — jednotný, přístupný filter trigger s `aria-expanded`, `aria-controls`, aktivním countem a stejnou ikonou. Přesně to, co brief pod `FilterTrigger` chce. **Nesahal jsem na něj.**

Tahle vlna proto nebyla „vytvoř primitiva", ale „dokonči vzor" — stejná lekce jako repository vlny.

## Co se změnilo

### `Button` a `IconButton` (nová primitiva)

`src/components/ui/Button.tsx`. Variantový vocabulary (`primary` / `secondary` / `ghost` / `destructive`), `loading` stav se spinnerem, `leadingIcon`. `IconButton` **vyžaduje `aria-label` typem**, ne konvencí — icon-only tlačítko nemá text, na který by se čtečka vrátila.

Styly v `src/styles/primitives/button.css` (brief požaduje `src/styles/primitives/`).

### Oddělení variantu od umístění (audit D2-2)

Klíčové rozhodnutí. `.btn-*` třídy nesou **jen vzhled**. Velikost a umístění řídí kontejner:

```css
.header-actions .btn { height: 44px; padding: 8px 16px; ... }
```

Hodnoty přesně zrcadlí staré `.header-action-button`, takže migrace tlačítka nic vizuálně nemění. Změna variantu už ale nemůže pohnout layoutem.

### Migrované call sites (11)

| Screen | Před | Po |
| --- | --- | --- |
| Activities, Chores, Family, Health, Shopping, Meal Library/Plan/Vote (8×) | `<button className="header-action-button">+ Add</button>` | `<Button variant="primary" leadingIcon="+">` |
| Calendar | `header-icon-button` + `header-action-button btn-secondary` | `<IconButton variant="primary">` + `<Button variant="secondary">` |
| Planner | ruční `.screen-header` + `header-action-button planner-create-button` | `<ScreenHeader>` + `<Button>` |

### `home-title` → `screen-title` (audit D1-1)

Sdílený header používal `h1` třídu pojmenovanou po Home na **všech** obrazovkách. Přejmenováno na `screen-title`; CSS pravidla mají `.home-title, .screen-title` alias, takže vzhled je byte-identický. `home-title` zůstal jen na skutečné Home obrazovce (`TodayDashboard`), což hlídá test.

## Ověřeno v běžícím prohlížeči

Na rozdíl od auditu jsem tady mohl měřit dopad změny přímo. Po migraci, na 390px:

| Route | h1 | primary akce | overflow |
| --- | --- | --- | --- |
| calendar | `screen-title` 25px | 44px vysoké | 0 |
| plan, chores, activities, health, shopping, family | `screen-title` 25px | 44px vysoké | 0 |

A funkčně: kliknutí na migrované „+ Přidat" na `/shopping` otevře create wizard, tlačítko je 44px vysoké. ✅

**Pozn. k flex-grow:** header akce se na mobilu roztahují na plnou šířku kvůli existujícímu pravidlu `.feature-screen-header .header-actions > * { flex: 1 1 auto }` (řádek 6668, nezměněno). Staré `.header-icon-button` se roztahovalo stejně — kalendářní „+" bylo ~136px široké před i po. Zachováno věrně, ne vylepšeno.

## Co jsem nedělal a proč

**Vizuální posouzení pořád chybí.** Screenshoty v tomto prostředí netimeoutují jinak než na 30s (viz audit §0). Změřil jsem rozměry, třídy, overflow a funkčnost přes DOM, ale jak to **vypadá**, neposoudil jsem. Před mergem se na to podívej.

**Nemigroval jsem tlačítka mimo hlavičky.** Brief scope je „screen headers, toolbar actions" a explicitně „Nemigruj současně formuláře, list rows ani modaly". Form/list/modal tlačítka zůstala.

**Neodstranil jsem `.header-action-button` / `.header-icon-button` CSS.** `FilterDisclosureToggle` je pořád používá (`header-action-button btn-secondary filter-disclosure-toggle`). Brief: „odstraň feature CSS jen když všichni consumers přešli." Nepřešli, tak zůstává.

**Kalendářní icon button 136px.** Zachoval jsem pre-existující chování. Zúžit na čistých 44×44 by byla vizuální změna, kterou nemůžu ověřit.

## Guard

`src/headerPrimitiveContract.test.ts`:

- žádný komponent nestaví `.screen-header` markup mimo primitivum,
- sdílený title je `screen-title`, `home-title` jen na Home,
- header create akce jdou přes `<Button>`/`<IconButton>` (žádný nový `header-action-button` v TSX),
- `IconButton` vyžaduje `aria-label`,
- variant a umístění oddělené (toolbar sizuje `.btn`, Button nezná `header-action-button`).

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 225 souborů, 1391 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| Browser QA | ⚠️ **jen měřené kontrakty** — rozměry, třídy, overflow, funkčnost. Bez vizuálního posouzení. |

## Zbývá pro další design vlny

- Migrace ne-header tlačítek (form/list/modal) — Wave 3.
- Odstranění `.header-action-button` CSS až `FilterDisclosureToggle` přejde na primitivum.
- Kalendářní icon button na čistých 44×44.
- Duplicitní `.home-title` base pravidla (dvě definice) — Wave 4 (CSS architektura).
- **Vizuální průchod člověkem** napříč routami a viewporty.

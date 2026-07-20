# Rodinka — P1 Repository + Design system implementační mapa

Tento balíček rozděluje dvě P1 oblasti do samostatných auditů a bezpečných implementačních vln:

1. Repository a datová vrstva.
2. Design system, CSS a UX konzistence.

Každý soubor je určen jako samostatný prompt pro Codex nebo Claude Code. Jeden prompt má ideálně odpovídat jednomu PR.

## Doporučené pořadí

```text
Repository audit
  ↓
Repository Wave 1 — Meals
  ↓
Repository Wave 2 — Activities + occurrence assignments
  ↓
Repository Wave 3 — Reminders
  ↓
Repository Wave 4 — Family members/settings + allowance
  ↓
Repository Wave 5 — Messages   (přidáno po auditu, viz níže)
  ↓
Design system audit
  ↓
Design Wave 1 — Screen headers, toolbars, buttons a filters
  ↓
Design Wave 2 — Modal, sheet, forms, sticky Save a mobile keyboard
  ↓
Design Wave 3 — Cards, list rows, states a destructive actions
  ↓
Design Wave 4 — CSS architektura, guardy a specificity cleanup
```

Repository a design-system práce mohou po úvodních auditech částečně probíhat paralelně, ale v jednom PR nekombinuj datovou migraci s plošným UI refaktorem.

## Společná pravidla

- Nevymýšlej novou architekturu, pokud existující cílový pattern řeší problém.
- Jeden PR řeší jednu doménu nebo jedno ucelené UX workflow.
- Před implementací zapiš konkrétní before stav.
- Po implementaci zapiš after stav, zbylé dluhy a rizika.
- Nepřepisuj celou aplikaci ani celý CSS soubor najednou.
- Zachovej funkční offline, realtime, child-account, push a deep-link scénáře.
- Nové abstrakce musí mít alespoň dva reálné consumery nebo jasný bezprostřední migrační plán.
- Generický CRUD framework ani univerzální „design component factory“ nejsou cílem.

## Povinná validace

```bash
npm run lint
npm test
npm run build
npm run check:edge-functions
git diff --check
```

Při zásahu do Supabase/RLS/RPC:

```bash
npm run test:db
```

## Soubory v balíčku

### Repository a datová vrstva

- `01_REPOSITORY_DATA_LAYER_AUDIT.md`
- `02_REPOSITORY_WAVE_MEALS.md`
- `03_REPOSITORY_WAVE_ACTIVITIES_OCCURRENCES.md`
- `04_REPOSITORY_WAVE_REMINDERS.md`
- `05_REPOSITORY_WAVE_FAMILY_ALLOWANCE.md`
- `06_REPOSITORY_WAVE_MESSAGES.md` — **nebyl v původním balíčku.** Audit datové vrstvy zjistil, že messages je s 30 voláními druhá nejzatíženější doména a plán vln ji přeskakoval. Doplněno jako samostatná vlna, protože má optimistické odesílání, lifecycle příloh a vazbu na presence/push — do žádné z existujících vln nepatří.

### Design system, CSS a UX

- `10_DESIGN_SYSTEM_UX_AUDIT.md`
- `11_DESIGN_WAVE_HEADERS_TOOLBARS_FILTERS.md`
- `12_DESIGN_WAVE_MODAL_SHEET_FORMS_MOBILE.md`
- `13_DESIGN_WAVE_LISTS_STATES_ACTIONS.md`
- `14_DESIGN_WAVE_CSS_ARCHITECTURE_GUARDS.md`

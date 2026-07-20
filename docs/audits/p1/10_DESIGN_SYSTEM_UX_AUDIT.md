# Rodinka — P1 audit design systému, CSS a UX konzistence

Proveď hloubkový audit celé aplikace Rodinka primárně pomocí Claude Code a browser QA.

Nejde jen o barvy nebo vizuální facelift. Cílem je sjednotit opakující se UX contracts, component primitives, mobilní chování a CSS architekturu.

Nevytvářej nový design od nuly. Zachovej současný charakter Rodinky, tokeny, member accent barvy a mobile-first přístup.

## Auditní výstup

Vytvoř:

```text
docs/audits/DESIGN_SYSTEM_UX_CONSISTENCY_AUDIT.md
```

## Povinné browser QA

Procházej skutečné obrazovky a interakce, ne pouze zdrojové CSS.

Minimálně ověř:

- Home/Dnes,
- Calendar,
- Planner,
- Chores,
- Activities,
- Health,
- Meals,
- Shopping,
- Family,
- Member edit,
- Allowance,
- Messages,
- Reminder Center,
- More/Settings,
- Create Record wizard,
- offline/degraded stavy,
- child account varianty.

Viewporty:

- 320 × 568,
- 360 × 800,
- 375 × 812,
- 390 × 844,
- tablet portrait,
- desktop.

Zvlášť ověř iOS PWA behavior:

- safe areas,
- visual viewport,
- keyboard,
- input zoom,
- fixed/sticky elements,
- fullscreen chat,
- nested modal/sheet,
- scroll restoration.

## 1. Screen header contract

Porovnej napříč aplikací:

- nadpis,
- případný subtitle,
- primary action,
- Today action,
- filter trigger,
- back action,
- overflow actions,
- responsive wrapping.

Zdokumentuj všechny varianty a nekonzistence.

Navrhni jednotné primitivum:

```ts
<ScreenHeader
  title=""
  subtitle=""
  primaryAction={...}
  secondaryActions={...}
  filterAction={...}
/>
```

Přesné API přizpůsob reálným potřebám.

## 2. Toolbar a button hierarchy

Audituj:

- pořadí primary/secondary/filter akcí,
- icon-only buttons,
- floating plus buttons,
- disabled/loading states,
- destructive buttons,
- touch target,
- focus ring,
- aria-label.

Definuj varianty:

- primary,
- secondary,
- ghost,
- quiet,
- destructive,
- icon-only.

Nedovol feature-specific button CSS, pokud odpovídá existující variantě.

## 3. Modal vs. fullscreen sheet

Inventarizuj všechny modaly a sheets:

- desktop modal,
- mobile bottom/fullscreen sheet,
- nested dialog,
- detail editor,
- destructive confirmation,
- wizard.

U každého ověř:

- focus trap,
- focus return,
- Escape/back,
- body scroll lock,
- internal scroll ownership,
- sticky header/footer,
- safe area,
- keyboard overlap,
- dirty-state confirmation.

Navrhni jediný Modal/Sheet contract.

## 4. Sticky Save footer

Porovnej editace:

- člena,
- family settings,
- allowance,
- activity,
- meal,
- reminder preferences,
- další dlouhé formuláře.

Audituj:

- je Save vždy viditelný?
- překrývá obsah?
- reaguje na keyboard?
- má disabled/loading state?
- je Cancel/Back konzistentní?
- funguje na iOS PWA?

Navrhni `StickyActionFooter`.

## 5. List row a detail row

Porovnej:

- chores,
- shopping items,
- calendar entries,
- family members,
- messages/conversations,
- reminders,
- meal rows,
- activity participants.

Rozliš:

- navigační row,
- selectable row,
- toggle/check row,
- editable row,
- status/detail row,
- destructive swipe/inline action, pokud existuje.

Navrhni `ListRow` s variantami, ne jeden přetížený komponent s desítkami boolean props.

## 6. States

Audituj všechny:

- empty,
- loading,
- skeleton,
- inline loading,
- error,
- retryable error,
- offline,
- degraded,
- no permission,
- no results,
- end of pagination.

Navrhni jednotný vocabulary a primitives.

Offline nesmí vypadat stejně jako permission error.

## 7. Form contract

Porovnej:

- label,
- required marker,
- hint,
- placeholder,
- validation timing,
- inline error,
- server error,
- checkbox/radio/toggle,
- date/time,
- select,
- member picker,
- textarea,
- file/photo input.

Navrhni:

- `FormField`,
- `FieldLabel`,
- `FieldHint`,
- `InlineError`,
- shared input sizing/focus/error contract.

Obecný `label`/`input` selector nesmí být hlavní způsob stylování všech feature formulářů.

## 8. Destructive actions

Audituj:

- delete,
- archive,
- unlink account,
- clear offline data,
- remove participant/member,
- discard changes.

Ověř:

- destructive styling,
- confirmation copy,
- scope akce,
- možnost undo,
- loading/double submit,
- child/parent permissions.

## 9. CSS architektura

Zmapuj současný stylesheet:

- tokens,
- reset/base,
- shell/layout,
- primitives,
- feature styles,
- utility rules,
- specificity patches,
- duplicate selectors,
- global element selectors,
- `!important`,
- undefined variables,
- dead CSS.

Navrhni minimálně:

```text
src/styles/
  tokens.css
  base.css
  primitives/
  layout/
  features/
```

Neprováděj big-bang rewrite.

## 10. Primitive inventory

Navrhni implementační pořadí pro:

- `ScreenHeader`,
- `ScreenToolbar`,
- `Button`,
- `IconButton`,
- `Card`,
- `ListRow`,
- `StatusPill`,
- `FormField`,
- `FieldHint`,
- `InlineError`,
- `Modal` / `Sheet`,
- `StickyActionFooter`,
- `FilterTrigger`,
- shared state components.

U každého uveď:

- existující podobné komponenty,
- consumers,
- rozdíly,
- minimální API,
- migraci,
- riziko.

## 11. Prioritizace

Každý nález označ:

- `P0` — nefunkční save/scroll/keyboard/focus nebo accessibility blocker,
- `P1` — výrazná nekonzistence workflow nebo opakovaný CSS patch,
- `P2` — vizuální cleanup.

Uveď screenshot/route/viewport a konkrétní selector/component.

## Implementační plán

Audit má připravit čtyři samostatné vlny:

1. Headers, toolbars, buttons a filters.
2. Modal/sheet, forms, sticky Save a mobile keyboard.
3. Cards, list rows, states a destructive actions.
4. CSS architektura, guardy a specificity cleanup.

## Co neimplementovat v auditním PR

- plošný rewrite všech 8 000+ řádků CSS,
- nový vizuální brand,
- výměnu ikon/fontu bez nálezu,
- redesign všech screens,
- univerzální mega-komponentu,
- změny business logiky.

## Acceptance criteria

- Audit pokrývá skutečné routes a viewporty.
- Každá nekonzistence má screenshot/route/viewport nebo přesný code reference.
- Existuje primitive inventory a migrační plán.
- Jsou popsány safe-area, scroll a keyboard problémy.
- CSS je rozděleno na konkrétní typy dluhu.
- Audit doporučuje postupné workflow migrations, ne big-bang rewrite.

# Rodinka — Design Wave 1: ScreenHeader, toolbar, buttons a filters

Implementuj první design-system vlnu podle hotového UX auditu.

Scope je pouze:

- screen headers,
- toolbar actions,
- button hierarchy,
- icon buttons,
- filter trigger,
- pořadí a responsive chování akcí.

Nemigruj současně formuláře, list rows ani všechny modaly.

## Cíl

Sjednotit opakující se pattern:

```text
nadpis
+ primární akce
+ Today
+ filtr
+ případné další akce
```

napříč aplikací.

## Primitive API

Vytvoř nebo sjednoť:

- `ScreenHeader`,
- `ScreenToolbar`,
- `Button`,
- `IconButton`,
- `FilterTrigger`.

API navrhni podle reálných consumers.

Vyhni se:

- desítkám boolean props,
- feature-name props,
- inline CSS escape hatches jako hlavnímu způsobu použití,
- implicitnímu pořadí podle DOM hacků.

## ScreenHeader

Musí podporovat:

- title,
- subtitle,
- back action,
- primary action,
- secondary actions,
- filter action,
- compact/mobile variantu,
- wrapping bez horizontálního scrollu,
- accessible heading level.

## Button hierarchy

Definuj varianty:

- primary,
- secondary,
- ghost/quiet,
- destructive,
- icon-only.

Každá varianta musí mít:

- default,
- hover,
- active,
- focus-visible,
- disabled,
- loading.

Icon-only button vyžaduje accessible label.

Touch target minimálně 44 × 44 px tam, kde je tlačítko samostatnou mobilní akcí.

## FilterTrigger

Jednotný trigger musí:

- používat stejnou ikonu,
- mít stejné umístění,
- indikovat aktivní filtry,
- případně zobrazit count,
- mít aria-expanded/controls,
- zachovat existující filter panel/sheet logic.

## Migrační pořadí

Migruj po workflows:

1. Calendar.
2. Planner.
3. Chores.
4. Activities.
5. Meals.
6. Shopping.
7. Family.
8. Messages/Reminders/More podle auditu.

Každou route vizuálně ověř před přechodem na další.

## CSS

Styles přesuň do:

```text
src/styles/primitives/
src/styles/layout/
```

Odstraň feature-specific header/button pravidla pouze tehdy, když všichni jejich consumers přešli na primitive.

## Browser QA

Ověř:

- 320 px šířku,
- dlouhý český/anglický title,
- title + primary + Today + filter,
- pouze filter,
- back + title + save,
- desktop,
- keyboard navigation,
- reduced motion.

## Testy

1. semantic heading,
2. action ordering,
3. icon button aria-label,
4. active filter indicator,
5. responsive wrapping,
6. no horizontal overflow,
7. disabled/loading button,
8. destructive variant,
9. keyboard focus,
10. representative route contract tests.

## Dokumentace

Vytvoř:

```text
docs/implementation/DESIGN_WAVE_1_HEADERS_TOOLBARS_FILTERS.md
```

Přidej before/after screenshoty hlavních routes.

## Co neměnit

- business logiku filtrů,
- modal/sheet architecture,
- form fields,
- list row design,
- feature data loading.

## Acceptance criteria

- Hlavní routes používají společný ScreenHeader/Toolbar contract.
- Primary, Today a filter actions mají jednotné pořadí.
- Button hierarchy je konzistentní a přístupná.
- Neexistuje nový feature-specific header CSS pro migrované routes.
- Mobilní layout nemá horizontální scroll ani překryv akcí.

# Rodinka — Design Wave 3: Cards, ListRow, StatusPill, states a destructive actions

Implementuj třetí design-system vlnu.

Scope:

- Card,
- ListRow,
- detail/status row,
- StatusPill,
- empty/loading/error/offline states,
- destructive actions a confirmations.

## Cíl

Sjednotit informační hierarchii a chování opakujících se řádků a stavů bez ztráty identity jednotlivých features.

## Card

Definuj několik jasných variant:

- standard,
- interactive,
- selected,
- muted/secondary,
- warning/error.

Nepoužívej levý barevný border jako univerzální status řešení, pokud to odporuje současnému vizuálnímu směru.

Member accent používej cíleně.

## ListRow

Rozliš reálné typy:

- navigation row,
- selectable row,
- check/toggle row,
- editable row,
- summary/detail row.

Navrhni composition API místo množství feature-specific props:

```tsx
<ListRow
  leading={...}
  title={...}
  description={...}
  meta={...}
  trailing={...}
/>
```

Specializované chování nech wrapper komponentám.

## StatusPill

Definuj semantické varianty:

- neutral,
- info,
- success,
- warning,
- danger,
- pending/offline.

Status nesmí být sdělen pouze barvou.

## Shared states

Vytvoř konzistentní primitives pro:

- loading,
- skeleton,
- empty,
- no results,
- retryable error,
- fatal error,
- offline snapshot,
- degraded backend,
- permission denied,
- end of list.

Každý stav musí mít:

- jasný title,
- vysvětlení,
- vhodnou akci,
- případný technical detail pouze v dev,
- accessibility status/live region tam, kde je vhodné.

Offline nesmí vypadat stejně jako permission error.

## Destructive actions

Sjednoť:

- delete,
- archive,
- unlink,
- clear cache/offline data,
- remove member/participant,
- discard changes.

Confirmation musí explicitně říct:

- co se smaže,
- scope jedné occurrence vs. celé série,
- zda je akce vratná,
- co se zachová.

Zabraň double submit.

## Migrační workflows

Vyber reprezentativní oblasti:

1. Chores list.
2. Shopping list.
3. Family members.
4. Reminder list.
5. Activities/Calendar rows.

Nemigruj všechny features v jednom PR, pokud rozsah překročí čitelnou změnu.

## Testy

1. semantic button/link row behavior,
2. keyboard activation,
3. selected/disabled state,
4. status text mimo barvu,
5. empty/error/offline differentiation,
6. retry action,
7. destructive confirmation copy/scope,
8. double-submit prevention,
9. responsive row layout,
10. visual screenshots.

## Dokumentace

Vytvoř:

```text
docs/implementation/DESIGN_WAVE_3_LISTS_STATES_ACTIONS.md
```

## Co neměnit

- business state machine,
- data fetching,
- celé screen layouts,
- feature-specific artwork,
- swipe gesture bez existujícího contractu.

## Acceptance criteria

- Vybrané features používají shared Card/ListRow/StatusPill primitives.
- Offline, degraded, permission a generic error jsou vizuálně i významově odlišné.
- Destructive actions mají konzistentní scope a potvrzení.
- Stav není sdělen pouze barvou.
- Migrované feature CSS neobsahuje duplicitní row/card/status implementace.

# Rodinka — Repository Wave 1: Meals, meal plan a voting

Implementuj první doménovou migraci podle `REPOSITORY_DATA_LAYER_AUDIT.md`.

Tato vlna se zaměřuje pouze na:

- meal library,
- meal plan,
- meal voting rounds,
- candidates a votes,
- případné vazby na meal ingredients pouze na úrovni jasně definovaného application workflow.

## Cíl

Přesunout low-level Supabase práci z Meals hooků/contextů do existující repository architektury a odstranit full-refresh orchestration tam, kde lze bezpečně použít targeted update nebo realtime reconciliation.

## Povinná příprava

Před změnou zapiš:

- všechny Meals `.from()`, `.rpc()` a `.channel()` cally,
- všechny dotčené tabulky,
- aktuální fetch/mutation/realtime vlastníky,
- všechny mutation → refresh flows,
- optimistic update chování,
- duplicate select definitions,
- nested realtime vazby.

Výstup vlož do:

```text
docs/implementation/REPOSITORY_WAVE_1_MEALS.md
```

## Cílové moduly

Přesnou strukturu přizpůsob repozitáři, ale preferuj hranice typu:

```text
src/features/meals/
  domain/
    mealTypes.ts
    mealMappers.ts
    mealErrors.ts
  data/
    mealsRepository.ts
    supabaseMealsRepository.ts
  application/
    mealPlanningService.ts
  state/
    MealsProvider.tsx
```

Nevytvářej složky pouze pro estetiku. Každý modul musí mít jasnou odpovědnost.

## Repository rozhraní

Navrhni doménové operace podle reálného UI:

- načíst meal library,
- vytvořit jídlo,
- upravit jídlo,
- archivovat/smazat jídlo podle existujícího chování,
- načíst plán pro rozsah,
- naplánovat/přeplánovat jídlo,
- odebrat plán,
- načíst aktivní vote round,
- přidat kandidáta,
- hlasovat,
- uzavřít/resolve round, pokud aplikace tuto operaci podporuje.

Nepoužívej veřejný generický `create/update/delete(table)` interface.

## Mappers

Vytvoř jediný mapper pro každou row/aggregate:

- meal,
- meal plan entry,
- vote round,
- candidate,
- vote.

UI a context nesmí pracovat se snake_case Supabase rows.

Datumové hodnoty normalizuj jednotně.

## Error mapping

Mapuj:

- RLS/permission,
- unique conflict,
- not found,
- stale vote round,
- invalid plan range,
- network/backend,
- unknown.

UI má dostat normalizovaný error code a retryability.

## Realtime ownership

Meals realtime musí mít jednoho vlastníka.

Zachovej nested entities, ale:

- nedovol duplicate subscriptions,
- odděl library, plan a voting event handling,
- optimistic event + realtime echo musí být deduplikovaný,
- event musí aktualizovat pouze dotčený aggregate.

## Mutation reconciliation

Nahraď full refreshy tam, kde server response obsahuje dost dat.

Preferuj:

```text
optimistic patch
→ repository mutation
→ merge server row
→ ignore/dedupe realtime echo
```

Při složité server-side side effect může zůstat targeted refresh konkrétního aggregate nebo časového rozsahu.

Neprováděj globální `refreshMealsEverything()` po každé mutaci.

## Application service

Pokud workflow plánování jídla zasahuje i Shopping/ingredients, vytvoř úzký application service.

Service má koordinovat repositories, ne vlastnit React state.

Příklady:

- naplánovat jídlo a volitelně přidat jeho ingredience do nákupu,
- převést vítěze hlasování do plánu.

Nevytvářej povinnou coupling, pokud UI tyto kroky dnes spouští odděleně.

## Context/provider

Provider má být tenká vrstva:

- držet view state,
- volat repository/application service,
- aplikovat domain results,
- exposeovat stabilní doménové akce.

Nemá obsahovat `.from()`, `.rpc()`, `.channel()` ani row mapping.

## Testy

Doplň:

1. mapper tests,
2. repository contract tests,
3. normalizované errors,
4. meal create/update targeted merge,
5. plan add/move/remove,
6. vote candidate/vote reconciliation,
7. optimistic + realtime echo dedupe,
8. permission/network error,
9. no full library reload po jednoduché mutaci,
10. provider/context bez přímého Supabase přístupu,
11. data-access guard,
12. Home meal summary a Meals screen parity.

## Co neměnit

- UX Meals obrazovky,
- databázové schema bez jasné nutnosti,
- Shopping offline repository,
- Calendar architecture,
- unrelated providers,
- RLS kromě konkrétní opravy potvrzené testem.

## Acceptance criteria

- Meals UI/context neobsahuje přímé Supabase cally.
- Existují doménová repository rozhraní a row/domain mappers.
- Každý Meals select/RPC/subscription má jednoho vlastníka.
- Jednoduché mutace nespouštějí full reload celé Meals domény.
- Optimistic a realtime reconciliation nevytváří duplicity.
- Data-access guard pokrývá novou hranici.

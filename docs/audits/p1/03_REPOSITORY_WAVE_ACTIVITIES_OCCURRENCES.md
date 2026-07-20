# Rodinka — Repository Wave 2: Activities a occurrence assignments

Navazuj na dokončenou Meals repository migraci.

Tato vlna se zaměřuje na:

- activities,
- activity participants,
- recurring series,
- occurrence overrides,
- participant history,
- series assignment history,
- doprovod a přepínání odpovědných osob pro konkrétní výskyt.

Jde o citlivou doménu s historií a opakováním. Zachovej význam existujících dat a neprováděj schema redesign bez nezbytnosti.

## Cíl

Oddělit:

- definici série,
- konkrétní occurrence,
- override,
- assignment history,
- participant history,

do jasných domain modelů a repositories.

## Povinná příprava

Před implementací vytvoř v:

```text
docs/implementation/REPOSITORY_WAVE_2_ACTIVITIES_OCCURRENCES.md
```

mapu:

- tabulka → význam,
- select owner,
- mutation owner,
- realtime owner,
- historie vs. aktuální stav,
- recurrence expansion owner,
- Calendar snapshot consumer,
- reminder consumer.

Explicitně popiš, co je source of truth pro:

- účastníky série,
- změnu pouze jednoho výskytu,
- změnu tohoto a následujících výskytů,
- doprovod konkrétní occurrence,
- historickou assignment změnu.

## Domain model

Zaveď explicitní typy, například:

```ts
type ActivitySeries
type ActivityOccurrence
type OccurrenceOverride
type OccurrenceAssignment
type AssignmentHistoryEntry
```

Nespoléhej na jeden široký typ s desítkami nullable polí, pokud entity mají odlišný význam.

## Repository operace

Rozhraní orientuj na workflows:

- list activities,
- create series,
- update series,
- cancel/archive series,
- update participants,
- load occurrence state,
- override one occurrence,
- update this-and-following,
- assign adult/participant for occurrence,
- read assignment history,
- reconcile occurrence data for visible date range.

Neexponuj generické CRUD nad history tabulkami.

Historické záznamy se nemají „updateovat“ jako běžná entita, pokud jejich smyslem je append-only audit.

## Recurrence service

Recurrence expansion odděl od persistence.

Má být:

- čistá a testovatelná,
- timezone-aware,
- deterministická,
- schopná aplikovat override/history,
- bezpečná přes DST a přelom dne,
- sdílená Calendar/Planner/Today consumers.

Nevytvářej druhou konkurenční recurrence implementaci.

## Application services

Použij úzké services pro operace přes více aggregates, například:

- změnit sérii a vytvořit odpovídající history/override,
- přepnout doprovod jednoho occurrence,
- změnit participants od konkrétního data,
- archivovat sérii bez ztráty historie.

Service musí definovat transakční očekávání.

Pokud operace vyžaduje serverovou transakci, použij existující nebo cílené RPC. Nedělej několik klientských write callů, které mohou skončit napůl.

## Realtime a reconciliation

Urči jediného vlastníka každé tabulky.

Realtime update má:

- invalidovat pouze dotčenou sérii/date range,
- zachovat pending local mutations,
- nevyvolat full reload všech aktivit,
- neduplikovat Calendar subscription ownership.

Koordinuj hranici s Calendar snapshot writerem/repository, pokud již existuje po předchozích vlnách.

## Error mapping

Normalizuj minimálně:

- series not found,
- occurrence conflict,
- stale override,
- participant/member unavailable,
- permission denied,
- transaction failed,
- network/backend.

## Testy

1. row/domain mappers,
2. recurrence expansion,
3. one occurrence override,
4. this-and-following,
5. assignment history append semantics,
6. participant history,
7. adult escort switch,
8. DST/timezone/date boundaries,
9. server transaction failure bez partial UI state,
10. targeted reconciliation,
11. realtime dedupe,
12. Calendar/Today/Planner parity,
13. data-access guard,
14. archived series history remains readable.

## Co neměnit

- vizuální redesign Activities/Calendar,
- význam historie,
- plošný database rewrite,
- Meals/Shopping repositories,
- unrelated reminder UI.

## Acceptance criteria

- UI/context nemá přímé Supabase cally.
- Série, occurrence, override a history mají jasné doménové typy.
- Recurrence logika má jediného vlastníka.
- Cross-table operace používají application service/RPC tam, kde je nutná atomicita.
- Jedna změna occurrence nenačítá znovu všechny aktivity.
- Calendar a feature vrstva nedrží duplicate subscription ownership.

# Repository Wave 2 — Activities a occurrence assignments

Audit: [`docs/audits/REPOSITORY_DATA_LAYER_AUDIT.md`](../audits/REPOSITORY_DATA_LAYER_AUDIT.md)
Navazuje na: [Wave 1 — Meals](REPOSITORY_WAVE_1_MEALS.md)

## Before — mapa tabulek

| Tabulka | Význam | Select owner | Mutation owner | Realtime owner |
| --- | --- | --- | --- | --- |
| `activities` | **definice série**, ne výskyt | `useActivities` + `calendarSync` (2 kopie) | `ActivitiesContext` | `ActivitiesContext` |
| `activity_participants` | join série ↔ člen, composite key | přes join v selectu | RPC | `ActivitiesContext` |
| `occurrence_overrides` | odchylka **jednoho** výskytu | `useOccurrenceAssignments` + `calendarSync` (2 kopie) | RPC z hooku | `OccurrenceAssignmentsContext` |
| `series_assignment_history` | append-only audit „kdo od kdy" | `useOccurrenceAssignments` + `calendarSync` (2 kopie) | server | `OccurrenceAssignmentsContext` |
| `activity_participant_history` | append-only audit účasti | `useOccurrenceAssignments` + `calendarSync` (2 kopie) | server | `OccurrenceAssignmentsContext` |

Recurrence expansion: `utils/recurrence.ts` (čistá, jediný vlastník) — **nedotčeno**.
Calendar snapshot consumer: `calendarSync.fetchCalendarSnapshot`. Reminder consumer: `context/reminders/useReminderSources.ts`.

**8 přímých volání**, z toho 3 RPC.

## Source of truth

| Otázka | Odpověď |
| --- | --- |
| Účastníci série | `activity_participants` (aktuální stav), `activity_participant_history` je audit |
| Změna jednoho výskytu | `occurrence_overrides` řádek pro `(series_type, series_id, occurrence_date)` |
| Změna tohoto a následujících | `series_assignment_history` s `effective_from` — **ne** override |
| Doprovod konkrétního výskytu | `occurrence_overrides.companion_member_id` (`series_type = 'activity'`) |
| Historická assignment změna | `series_assignment_history`, append-only |

`companion_member_id` a `assignee_member_id` jsou dvě různé role ve stejné tabulce: doprovod u aktivity, řešitel u úkolu. Rozlišuje je `series_type`.

## After

```text
src/features/activities/
  domain/
    activityTypes.ts     — Activity a související typy (dřív v hooks/useActivities.ts)
    activityMappers.ts   — sloupce + mappery pro activities i occurrence tabulky
    activityErrors.ts    — ActivitiesError s AppErrorCode
  data/
    activitiesRepository.ts          — dvě rozhraní
    supabaseActivitiesRepository.ts  — dvě implementace
```

Oba contexty jsou tenké. `useActivities.ts` a `useOccurrenceAssignments.ts` smazány.

### Proč dvě repositories

`occurrence_overrides` a `series_assignment_history` mají `series_type: 'task' | 'activity'` — sdílí je **chores i activities**. `OccurrencesRepository` proto stojí vedle `ActivitiesRepository`, ne pod ním. Kdyby patřil pod activities, chores by musely sáhnout do cizí feature.

### Targeted reconciliation

Obě RPC (`create_activity_with_participants`, `update_activity_with_participants`) vracejí `uuid`. Repository ho použije k jednomu cílenému čtení místo dřívějšího `refreshActivities()` nad celou rodinou. Totéž `markPaymentPaid` přes `.select().single()`.

Realtime patchuje na místě. `activity_participants` nemá `id` ani `family_id` (composite key), takže se překládá na `participant-add` / `participant-remove` nad rodičovskou sérií — generické id-keyed primitivy sem nesedí.

### Duplicitní selecty odstraněny (P1-M1)

Čtyři seznamy sloupců byly psané ručně dvakrát — jednou ve feature loaderu, jednou v `calendarSync`. Teď je vlastní `activityMappers.ts` a `calendarSync` je importuje. Totéž pro `MEAL_PLAN_ENTRY_COLUMNS` z Wave 1.

Šlo o reálné riziko: přidání sloupce do jedné kopie a ne do druhé znamenalo, že kalendář a obrazovka aktivit ukazují pro stejný řádek jiná data. Test to hlídá.

### Historie je append-only

`OccurrencesRepository` **nemá** update ani delete nad history tabulkami. Přepsání historie by zničilo jedinou věc, kvůli které existuje — odpověď na „kdo měl tenhle výskyt na starosti". Zadání vlny to vyžaduje explicitně.

### Transakční očekávání

`set_occurrence_member_override` je serverová transakce. Při selhání se optimistický override vrací **celý** zpět a nedělá se žádné reconciliation čtení — nebylo co uklízet. Ověřeno testem.

## Odchylky a rozhodnutí

**Recurrence service nevytvořen.** Zadání žádá čistou, testovatelnou, timezone-aware expansion — `utils/recurrence.ts` už jí je a má vlastní testy. Zadání zároveň říká „Nevytvářej druhou konkurenční recurrence implementaci". Nová vrstva by byla přesně to.

**Application service nevytvořen.** Operace, které zadání zmiňuje (změnit sérii + history, přepnout doprovod, archivovat sérii bez ztráty historie), **už jsou serverové transakce** v RPC. Zadání říká „Pokud operace vyžaduje serverovou transakci, použij existující nebo cílené RPC. Nedělej několik klientských write callů." Klientský service koordinující jediné RPC volání by přidal vrstvu bez obsahu.

**Typy zůstaly v `utils/occurrenceAssignments.ts`.** Je to už čistý domain modul s pure resolution funkcemi a sdílí ho chores. Přesun by znamenal import sweep přes ~10 souborů bez zisku. Re-export shim jsem nedělal — v předchozím PR jsem shimy mazal jako mrtvý kód.

**snake_case ponechán**, stejně jako ve Wave 1 a ze stejného důvodu (`Activity` je v persistovaném calendar snapshotu). Viz P2-M2.

## Dopad na guard

```text
po Wave 1:  98 volání mimo datovou vrstvu, activities 8
po Wave 2:  90 volání mimo datovou vrstvu, activities 0
```

## Testy

| Soubor | Co pokrývá |
| --- | --- |
| `features/activities/domain/activityMappers.test.ts` | participants join, `payment_amount` jako string, **neplatné ISO weekday se zahodí**, defaulty, obě member role, otevřené období v historii, jediný seznam sloupců + že je `calendarSync` nemá podruhé |
| `features/activities/domain/activityErrors.test.ts` | permission bez Postgres textu, **stale override → conflict**, refinement jen na override cestě, retryable transport |
| `context/activities/OccurrenceAssignmentsContext.wave2.test.tsx` | optimistic → server reconcile, **rollback celé transakce**, nahrazení místo stohování, restore default, obě series types |
| `context/activities/ActivitiesContext.realtime.test.ts` | přepsán na repository seam; realtime update bez reloadu, zachování participants, dedupe echa |
| `calendar/calendarRealtimeOwnership.test.ts` | aktualizován — vlastníci se přesunuli do repositories |

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 219 souborů, 1343 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| `npm run check:data-access` | ✅ 90 známých volání (z 98) |
| `npm run check:edge-functions` | ✅ |
| `npm run test:db` | ⚠️ nespuštěno — Docker nedostupný; vlna nemění migrace ani RLS |

## Zbývá

- DST/timezone hraniční testy zadání žádá pod recurrence — `utils/recurrence.test.ts` je má; nové jsem nepřidával, protože recurrence jsem nezměnil.
- Calendar/Today/Planner parity není pokryta samostatným testem; opírá se o to, že snapshot i feature vrstva teď čtou stejné sloupce stejným mapperem.

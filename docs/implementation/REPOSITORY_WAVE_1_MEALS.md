# Repository Wave 1 — Meals, meal plan a voting

Audit: [`docs/audits/REPOSITORY_DATA_LAYER_AUDIT.md`](../audits/REPOSITORY_DATA_LAYER_AUDIT.md)

## Before

| Co | Kde |
| --- | --- |
| `.from('meals')` ×2, `.from('meal_plan_entries')` ×4, `.from('meal_vote_rounds')` ×2, `.from('meal_vote_candidates')` ×2, `.from('meal_votes')` ×1 | `useMealsDataSource.ts`, `useMeals.ts`, `useMealPlanEntries.ts`, `useMealVoteRounds.ts` |
| `.rpc('open_vote_round')` ×2, `.rpc('close_vote_round')` ×1 | `useMealsDataSource.ts` |
| `.channel('family:*:meals')` s 5 tabulkami | `useMealsDataSource.ts` |
| Select definice | 4× ručně psaný seznam sloupců, `meal_plan_entries` navíc podruhé v `calendarSync.ts` |
| Mutation → refresh | **každá** mutace končila `await refreshX()`; `refreshMealsData` navíc `Promise.all` přes všechny tři domény |
| Error handling | `friendly(error)` — Postgres text do UI |
| Domain typy | definované uvnitř fetch hooků |

Celkem **16 přímých volání**, doména byla druhá nejzatíženější po `family` a `messages`.

## After

```text
src/features/meals/
  domain/
    mealTypes.ts     — typy domény (dřív uvnitř fetch hooků)
    mealMappers.ts   — sloupce + row→domain mappery
    mealErrors.ts    — MealsError s AppErrorCode
  data/
    mealsRepository.ts         — rozhraní
    supabaseMealsRepository.ts — implementace včetně realtime
```

`src/context/meals/useMealsDataSource.ts` zůstal na místě (repo drží providery v `src/context/`), ale je z něj tenká vrstva: view state, volání repository, merge výsledku. Žádný `.from()`, `.rpc()`, `.channel()` ani mapping.

`src/hooks/useMeals.ts`, `useMealPlanEntries.ts`, `useMealVoteRounds.ts` **smazány** — jejich typy se přesunuly do domény, jejich fetch do repository. 19 souborů přepsalo import typů.

### Klíčové změny

**Targeted merge místo full reload.** Každá mutace vrací dotčený aggregate (`.select().single()`), provider ho slučuje podle `id`. Přidání jídla už nerefetchuje plán ani hlasování. Ověřeno testem, který počítá volání loaderů.

**Jeden seznam sloupců na aggregate.** `MEAL_PLAN_ENTRY_COLUMNS` je teď jediná definice — dřív byla ručně psaná na dvou místech (meals loader a `calendarSync`). Shodovaly se náhodou; jakmile by se rozešly, kalendář a plánovač by pro stejný záznam ukazovaly jiná data (audit P1-M1).

**Realtime má jednoho vlastníka** v repository. Vote rounds jsou vnořený aggregate, takže candidate/vote událost se překládá na „tento round se změnil" a provider dočte jen ten round.

**Normalizované chyby.** `MealsError` nese `AppErrorCode`, `operation` a `retryable`. Zvláštní případ: RPC odmítne uzavřený round jako `P0001` — to není `mutation-failed`, ale `conflict`, protože uživatel má načíst znovu, ne opakovat.

**Mappery jsou obranné.** `tags: null → []`, `prep_minutes: '45' → 45`, hlas mimo `-1|0|1` → abstence, chybějící enum → bezpečný default.

## Odchylky od zadání vlny

Dvě, obě vědomé.

### 1. camelCase přejmenování odloženo

Zadání říká „UI a context nesmí pracovat se snake_case Supabase rows". Neudělal jsem to a **není to opomenutí**.

`MealPlanEntry` není typ jen pro meals: je uložený v persistovaném calendar snapshotu a čte ho šest util modulů (`todayAgenda`, `calendarEntries`, `mealPlanGrouping`, `mealSuggestions`, `mealVoting`, `mealLabels`), Today dashboard a reminder sources. Měření před změnou: `responsible_member_id` 50 výskytů, `meal_id` 28, `entry_date` 20.

Přejmenování by tedy nebylo „meals" změna, ale cross-domain refaktor včetně bumpu schema verze calendar snapshotu — a to zadání vlny výslovně zakazuje („Co neměnit: Calendar architecture"). Vlastní audit tuto úvahu už obsahuje jako P2-M2.

Doporučení: samostatný PR, po dokončení všech čtyř vln, kdy bude jasné, kolik domén sdílí jaké typy.

### 2. Application service nevytvořen

Zadání ho žádá **podmíněně** („Pokud workflow plánování jídla zasahuje i Shopping"). Dnes UI spouští „naplánovat jídlo" a „přidat ingredience do nákupu" odděleně a zadání zároveň říká „Nevytvářej povinnou coupling, pokud UI tyto kroky dnes spouští odděleně."

Service by tedy koordinoval workflow, který jako workflow neexistuje. Až vznikne (např. tlačítko „naplánovat a nakoupit"), je `application/mealPlanningService.ts` správné místo.

### Poznámka: `meal_ingredients` zůstává v shopping kontextu

Audit je zařadil do Wave 1. Při implementaci se ukázalo, že `ensureMealIngredients` / `replaceMealIngredients` v `useShoppingDataSource.ts` jsou líné čtení pro nákupní obrazovku, ne meal-planning workflow. Přesun by znamenal sáhnout do shopping kontextu bez zisku. Zůstávají jako 2 volání v doméně `shopping`; opravuji tím vlastní audit.

## Dopad na guard

```text
před:  114 volání mimo datovou vrstvu, meals 16
po:     98 volání mimo datovou vrstvu, meals 0
```

Baseline regenerován (`73 signatur`). Guard `--check` na starém baselinu selhal — přesně jak má, protože dluh zmizel.

## Testy

| Soubor | Co pokrývá |
| --- | --- |
| `src/features/meals/domain/mealMappers.test.ts` | mappery, nullable, numeric jako string, neplatný hlas, prázdné kandidáty, jediný seznam sloupců |
| `src/context/meals/useMealsDataSource.wave1.test.tsx` | targeted merge (mutace nerefetchují doménu), plan add/move/remove, vote round resolution, realtime insert/delete, **optimistic + realtime echo dedupe**, bezpečná chybová hláška, provider bez Supabase |
| `src/calendar/calendarRealtimeOwnership.test.ts` | aktualizován — vlastník `meal_plan_entries` se přesunul do repository |

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 217 souborů, 1320 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| `npm run check:data-access` | ✅ 98 známých volání (ze 114) |
| `npm run check:edge-functions` | ✅ |
| `git diff --check` | ✅ |
| `npm run test:db` | ⚠️ nespuštěno — Docker nedostupný; vlna nemění migrace ani RLS |

## Zbývá

- camelCase přejmenování (viz odchylka 1),
- `planEntriesLoading` / `planEntriesError` teď reflektují celou meals doménu, ne jen plán — Today dashboard tak čeká na všechna tři načtení místo jednoho. Načítají se jedním `Promise.all`, takže rozdíl je malý, ale je to změna chování.

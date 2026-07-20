# Rodinka — audit repository a datové vrstvy

Datum: 2026-07-20
Základ: `main` @ `e346595` + merge P2 batche
Nástroj: `npm run audit:data-access` (AST, ne regex)

Cílem není nová architektura. Cílová architektura v repozitáři existuje (`src/repositories/chores`, `src/repositories/medical`, `src/shopping`, `src/calendar`) a je správná — chybí jí dokončení a hranice, která zabrání návratu přímých volání do UI vrstvy.

---

## 0. Jak číst tento audit

Inventory není psaný ručně. Generuje ho `scripts/audit-data-access.mjs` z TypeScript AST a výstup je v:

- `docs/audits/data-access-report.md` — čitelná tabulka všech volání,
- `docs/audits/data-access-report.json` — strojově čitelná verze.

Proč AST a ne regex: `Array.from()` není čtení tabulky, `supabase.storage.from('member-avatars')` je bucket a ne tabulka, a `.rpc()` přes přejmenovaný import je pořád `.rpc()`. Skript proto rozpouští kořenový identifikátor řetězce volání zpět na Supabase klienta.

---

## 1. Inventory — souhrn

**138 volání celkem**, z toho **114 mimo schválené vrstvy**.

| Vrstva | Volání | Poznámka |
| --- | --- | --- |
| `state` (context/hooks) | 112 | **jádro problému** |
| `data` (repositories) | 14 | cílový stav |
| `infrastructure` | 8 | schválené výjimky |
| `ui` (components) | 2 | `OnboardingScreen` volá RPC přímo |
| `other` | 2 | Family Jump remote (schválená výjimka) |

| Typ | Počet |
| --- | --- |
| `table` (`.from`) | 60 |
| `rpc` | 48 |
| `storage` | 28 |
| `channel` | 2 |

### Dluh podle domény

| Doména | Volání | Vlna |
| --- | --- | --- |
| family (members, settings, profiles, onboarding) | 38 | Wave 4 |
| messages | 30 | **není ve vlnách — viz §9** |
| meals | 16 | **Wave 1** |
| activities + occurrences | 8 | Wave 2 |
| allowance | 8 | Wave 4 |
| reminders | 8 | Wave 3 |
| chores | 3 | většina hotová |
| shopping | 2 | `meal_ingredients` v shopping kontextu |
| medical | 1 | většina hotová |

### Nejzatíženější soubory

| Volání | Doména | Soubor |
| --- | --- | --- |
| 22 | messages | `src/context/messages/useMessagesContentSource.ts` |
| 15 | family | `src/context/family/FamilySettingsContext.tsx` |
| 13 | meals | `src/context/meals/useMealsDataSource.ts` |
| 11 | family | `src/context/family/FamilyMembersContext.tsx` |
| 8 | messages | `src/context/messages/useMessagesSummarySource.ts` |
| 8 | reminders | `src/context/ReminderContext.tsx` |
| 5 | allowance | `src/context/chores/AllowanceContext.tsx` |

Pozitivní nález: `chores` (3) a `medical` (1) jsou nízko právě proto, že už mají repository. Pattern funguje, jen není dotažený.

---

## 2. Schválené infrastrukturní výjimky

V `scripts/data-access-allowlist.json`. Žádná položka není wildcard nad `src`.

| Cesta | Důvod | Owner |
| --- | --- | --- |
| `src/supabaseClient.ts` | bootstrap klienta | infrastructure |
| `src/auth/**` | session a sign-out, ne feature data | infrastructure |
| `src/lib/**` | child-account administrace, privilegované operace | infrastructure |
| `src/realtime/**` | vlastní `.channel()`, aby ho nemusel feature kód | infrastructure |
| `src/push/**` | push subscriptions a presence | infrastructure |
| `src/repositories/**` | cílová vrstva | data |
| `src/shopping/**`, `src/calendar/**` | offline repositories, už na cílovém patternu | data |
| `src/features/*/data/**`, `src/features/*/storage/**` | per-feature data vrstva zaváděná vlnami | data |
| `**/*.test.ts(x)` | fixtures a fakes | tests |

---

## 3. Domain ownership matrix

Legenda: **C** = context/hook (dnešní stav), **R** = repository, **—** = neexistuje.

| Doména | Select | Mutation | RPC | Realtime | Mapper | Cache | Optimistic | Error mapping | Full reload po mutaci | Modulů na tabulku |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Meals | C | C | C | C | inline | — | částečné | raw | **ano** | 3 |
| Meal plan | C | C | C | C | inline | calendar snapshot | ne | raw | **ano** | 3 |
| Meal voting | C | C | C | C | inline | — | ne | raw | **ano** | 1 |
| Activities | C | C | C | C | `normalizeActivity` částečně | calendar snapshot | ne | raw | **ano** | 3 |
| Activity participants | C | C | C | C (nested) | inline | — | ne | raw | ano | 2 |
| Occurrence assignments | C | C | C | C | `utils/occurrenceAssignments` | calendar snapshot | ne | raw | ano | 2 |
| Reminders | C | C | C | — | inline | — | ne | raw | **ano** | 2 |
| Notification preferences | C | C | C | — | inline | — | ne | raw | ano | 1 |
| Family members | C | C | C | C | inline + `useFamilyMembers` | **query cache** | ne | raw | ano | 4 |
| Family settings | C | C | — | C | inline | **query cache** + IDB | ne | raw | ano | 2 |
| Allowance | C | C | C | C | inline | — | ne | raw | **ano** | 2 |
| Chores | **R** | **R** | **R** | **R** | `utils/choreModel` | calendar snapshot | částečné | `repositoryError` | částečně | 2 |
| Medical | **R** | **R** | — | **R** | `medicalRepository` | calendar snapshot | ne | `repositoryError` | ne | 2 |
| Messages | C | C | C | C | inline | — | ano | raw | ano | 2 |
| Shopping | **R** | **R** | **R** | **R** | `utils/shopping` | **IDB + queue** | **ano** | `AppErrorCode` | ne | 1 |
| Calendar offline | **R** | **R** | **R** | **R** | `calendarSync` | **IDB + queue** | **ano** | `AppErrorCode` | ne | 1 |

### Entity s více než dvěma přístupovými moduly

- **`members`** — čtou ho `useFamilyMembers`, `useFamily`, `FamilyMembersContext`, `calendarSync.fetchCalendarSnapshot`. Vlastnictví je zdokumentované v `docs/REPOSITORY_ARCHITECTURE.md` (query cache je autoritativní), ale žádný repository to nevynucuje.
- **`meals` / `meal_plan_entries`** — `useMealsDataSource`, `calendarSync`, `useShoppingDataSource` (přes `meal_ingredients`).
- **`activities`** — `ActivitiesContext`, `calendarSync`, `OccurrenceAssignmentsContext`.

---

## 4. Repository rozhraní

Referenční pattern už v repu je. `ShoppingRepository` a `CalendarRepository` mají doménové operace (`addItem`, `togglePurchased`, `addChore`, `retryFailed`), ne `create(table, row)`.

`choresRepository` a `medicalRepository` používají factory styl (`createChoresRepository`). Obojí je v pořádku; **nesjednocovat je násilím** — třída dává smysl tam, kde repository drží dlouhoběžící stav (offline queue), factory tam, kde je bezstavová.

Návrh rozhraní pro první čtyři vlny je v příslušných wave dokumentech. Společná pravidla:

- operace pojmenované podle workflow, ne podle tabulky,
- žádný veřejný `create/update/delete(table)`,
- vstupy a výstupy v doménovém tvaru (camelCase), ne Postgres rows,
- chyba je `RepositoryError` s kódem, ne `PostgrestError`.

---

## 5. Row/domain mappers

**Nález P1-M1 — duplicitní definice selectů.** Tři tabulky mají dvě různé definice sloupců na dvou místech:

| Tabulka | Místa |
| --- | --- |
| `occurrence_overrides` | `useOccurrenceAssignments.ts`, `calendarSync.ts` |
| `series_assignment_history` | `useOccurrenceAssignments.ts`, `calendarSync.ts` |
| `activity_participant_history` | `useOccurrenceAssignments.ts`, `calendarSync.ts` |

Rozejití těchto dvou seznamů znamená, že kalendář a obrazovka aktivit vidí jiná data pro stejnou entitu. Dnes se shodují náhodou, ne konstrukcí.

**Nález P1-M2 — snake_case mimo datovou vrstvu.** `ShoppingItem`, `Activity`, `Chore`, `MealPlanEntry` a další procházejí do UI v Postgres tvaru (`created_by_member_id`, `purchased_at`). Přepis na camelCase napříč je velký a rizikový; **doporučení: nedělat plošně**, ale nové repository vracet doménový tvar a starý ponechat, dokud danou doménu nepřevezme vlna.

**Nález P2-M3 — nekonzistentní parsování čísel.** `Number(row.reward_amount)` v `calendarSync`, `Number(row.amount)` u allowance plánů, jinde ne. Postgres `numeric` chodí jako string; kde se konverze zapomene, srovnávání a součty tiše selžou.

---

## 6. Error taxonomy

`src/errors/errorCodes.ts` (`AppErrorCode`, 12 kódů) vznikl v offline batchi a **je správný cíl**. `src/repositories/shared/repositoryError.ts` je starší, paralelní mechanismus.

**Doporučení: nezavádět třetí `RepositoryErrorCode`.** Zadání auditu ho navrhuje, ale `AppErrorCode` už pokrývá všechny navržené hodnoty kromě `validation-failed` a `rate-limited`. Doporučuji rozšířit `AppErrorCode` o tyto dva a `repositoryError` postupně na něj převést. Nová abstrakce by byla třetí konkurenční pattern — přesně to, co má audit odstranit.

**Nález P1-E1 — 24 míst v `context/`, `hooks/` a `components/` čte `error.message`.** UI tak zobrazuje text z Postgresu. Vlny to mají nahrazovat kódem + překladovým klíčem.

---

## 7. Application services

Reálné cross-module workflows nalezené v kódu:

| Workflow | Moduly | Stav |
| --- | --- | --- |
| Schválení úkolu → allowance ledger | chores + allowance | **už existuje** — `src/application/approveChoreCompletion.ts` |
| Plánování jídla → ingredience do nákupu | meals + shopping | dnes skládá UI (`useShoppingDataSource.importItems`) |
| Vytvoření aktivity → participants + assignment history | activities + occurrences | dnes v `ActivitiesContext` |
| Vytvoření/archivace člena → settings + cleanup | family | dnes rozprostřené |
| Reminder sync přes více domén | reminders + chores + activities + medical | `sync_member_reminders` RPC — **koordinaci dělá server**, klient jen volá |

Poslední řádek je důležitý: reminders **nepotřebují** application service, protože koordinace je v RPC. Vytvořit ho by byla vrstva bez obsahu.

---

## 8. Mutation → refresh audit

**49 `refreshX()` volání** v contextech a hoocích; **19 míst** volá několik refreshů najednou v `Promise.all`.

Typický tvar:

```text
mutace → refreshMeals() → refreshPlanEntries() → refreshVoteRounds()
```

| Doména | Full refresh po mutaci | Server vrací dost dat pro targeted update? |
| --- | --- | --- |
| Meals | ano | **ano** — `.insert().select().single()` už se používá jinde |
| Meal plan | ano | ano |
| Activities | ano | částečně (participants jsou nested) |
| Reminders | ano | ne — RPC vrací jen status, targeted refresh oprávněný |
| Allowance | ano | ano |
| Messages | ano | ano (optimistic už existuje) |

Doporučený jednotný postup pro vlny:

```text
optimistic local patch
→ repository mutation
→ merge server row z response
→ realtime echo dedupe podle id
→ targeted invalidace pouze dotčeného aggregate
```

**Neimplementovat optimistic update tam, kde není bezpečný rollback nebo idempotency** — u reminders a u RPC se server-side side effects zůstává targeted refresh.

---

## 9. Doporučené pořadí migrace

Pořadí ze zadání zůstává, s jednou výhradou.

1. **Meals, meal plan, voting** — 16 volání, jasně ohraničené, `useMealsDataSource.ts` je třetí nejzatíženější soubor. Dobrá první vlna: dost velká, aby pattern prokázala, dost malá, aby se dala zkontrolovat.
2. **Activities + occurrence assignments** — 8 volání, ale řeší duplicitní selecty z §5.
3. **Reminders** — 8 volání, koordinace už je na serveru.
4. **Family members/settings + allowance** — 46 volání dohromady, největší; těží z toho, že vzor bude po třech vlnách ustálený.

**Výhrada: `messages` (30 volání) není v žádné vlně.** Je to druhá nejzatíženější doména v aplikaci a plán ji přeskakuje. Nedoporučuji ji přidávat do stávajících vln — potřebuje vlastní, protože má optimistic updates, presence a push provázání. Ale mělo by to být vědomé rozhodnutí, ne opomenutí.

Shopping a Calendar se nepřepisují. Zbývající 2 volání v `useShoppingDataSource.ts` (`meal_ingredients`) patří do Wave 1, protože jsou to meals data v shopping kontextu.

---

## 10. Prioritizace nálezů

### P0

Žádný. Riziko datové nekonzistence, duplicate mutations ani security boundary nebylo v této vrstvě nalezeno — offline batche 1 a 2 pokryly to, co tam bylo.

### P1

| ID | Nález | Soubory | Riziko | Cílový vlastník |
| --- | --- | --- | --- | --- |
| P1-D1 | 112 přímých volání ve `state` vrstvě | `src/context/**`, `src/hooks/**` | context vlastní dotaz, mapping, error parsing i refresh orchestraci současně | doménové repositories |
| P1-M1 | Duplicitní definice selectů pro 3 tabulky | `useOccurrenceAssignments.ts`, `calendarSync.ts` | kalendář a obrazovka vidí jiná data pro stejnou entitu, jakmile se seznamy rozejdou | jeden mapper na tabulku |
| P1-E1 | 24 míst čte raw `error.message` | `context/`, `hooks/`, `components/` | Postgres text v UI | `AppErrorCode` |
| P1-R1 | Full refresh po jednoduché mutaci | 19 míst | zbytečné dotazy, blikání, race s realtime | targeted merge |
| P1-U1 | `OnboardingScreen` volá RPC přímo z komponenty | `src/components/OnboardingScreen.tsx:29,47` | jediná UI-vrstvá volání v aplikaci | family repository (Wave 4) |

### P2

| ID | Nález | Soubory |
| --- | --- | --- |
| P2-M2 | snake_case v doménových typech mimo data vrstvu | plošně |
| P2-M3 | Nekonzistentní `Number()` konverze u `numeric` sloupců | `calendarSync.ts`, allowance |
| P2-E2 | Dva paralelní error mechanismy (`repositoryError` vs. `AppErrorCode`) | `repositories/shared/`, `errors/` |
| P2-A1 | `messages` chybí v plánu vln | — |

---

## Guard

```bash
npm run audit:data-access    # report: konzole + JSON + Markdown
npm run check:data-access    # guard, exit 1
```

Guard staví na dvou souborech:

- `scripts/data-access-allowlist.json` — trvalé infrastrukturní výjimky,
- `scripts/data-access-baseline.json` — **známý dluh, 83 signatur / 114 volání**, který má každá vlna zmenšit.

Guard selže ve dvou směrech:

1. vznikne nové volání mimo allowlist i baseline,
2. baseline tvrdí dluh, který už neexistuje — nutí vlnu baseline aktualizovat místo toho, aby se stal skládkou.

Signatura je `soubor::typ::cíl`, ne číslo řádku, takže přesun kódu uvnitř souboru guard nerozbije.

Ověřeno oběma směry: přidání `supabase.from('members')` do `TodayDashboard.tsx` guard shodí, a baseline s neexistující položkou taky.

---

## Co tento PR záměrně neobsahuje

- migraci jakékoli domény (to jsou vlny 1–4),
- generický `BaseRepository` ani CRUD service,
- nový state-management,
- přepis Shopping/Calendar,
- změny RLS,
- UI změny.

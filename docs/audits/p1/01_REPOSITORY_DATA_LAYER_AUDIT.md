# Rodinka — P1 audit repository a datové vrstvy

Proveď hloubkový audit datové vrstvy aplikace Rodinka.

Existující cílová architektura je správný směr. Úkolem je tuto architekturu dokončit a sjednotit, nikoli zavádět další konkurenční pattern.

## Hlavní princip

Cílový tok má zůstat přibližně:

```text
React component
→ feature context / hook
→ application service nebo domain repository
→ cache / IndexedDB / mutation queue / Supabase / realtime
```

UI komponenta ani feature context nemají vlastnit low-level Supabase dotazy, row mapping, error parsing a full refresh orchestration současně.

## Cíle auditu

1. Zmapovat všechna přímá Supabase volání.
2. Určit jednoznačného vlastníka každého selectu, RPC a realtime subscription.
3. Najít domény, kde se míchá UI state, persistence, mapping, mutations a realtime.
4. Navrhnout dokončení existující repository architektury.
5. Rozdělit migraci do samostatných doménových PR.
6. Nevytvořit generický CRUD framework.
7. Připravit automatický guard proti návratu přímých Supabase callů do UI vrstvy.

## Auditní výstup

Vytvoř:

```text
docs/audits/REPOSITORY_DATA_LAYER_AUDIT.md
```

## 1. Inventory všech Supabase vstupů

Automaticky najdi a sepiš všechna produkční volání:

- `.from()`,
- `.rpc()`,
- `.channel()`,
- `.storage`,
- `createSignedUrl`,
- auth operace relevantní pro feature data,
- případné přímé `fetch()` na Supabase nebo Edge Functions.

Nevycházej pouze z ručního hledání. Přidej reprodukovatelný script, například:

```text
scripts/audit-data-access.mjs
```

Preferuj AST analýzu nebo jiný strukturální přístup před křehkým jednoduchým regexem.

Výstup musí obsahovat minimálně:

- soubor,
- řádek,
- typ volání,
- tabulku/RPC/channel, pokud ji lze staticky určit,
- feature/doménu,
- aktuální vrstvu,
- schválená výjimka ano/ne,
- doporučený vlastník.

## 2. Schválené infrastrukturní výjimky

Vytvoř explicitní allowlist pro místa, kde je low-level Supabase přístup legitimní, například:

- Supabase client bootstrap,
- auth/session infrastructure,
- repository implementations,
- dedicated realtime infrastructure,
- storage adapter,
- migration/diagnostic tooling,
- edge functions,
- test fixtures.

Allowlist nesmí být globální wildcard na celé `src`.

Každá výjimka musí mít:

- přesnou cestu nebo modulovou hranici,
- důvod,
- owner,
- případný plán migrace.

## 3. Domain ownership matrix

Pro každou hlavní doménu vytvoř tabulku:

- Meals,
- meal plan,
- meal voting,
- Activities,
- activity participants,
- occurrence assignments,
- occurrence overrides/history,
- Reminders,
- notifications/preferences,
- Family members,
- Family settings,
- Allowance,
- Chores,
- Medical,
- Messages,
- Shopping,
- Calendar offline.

U každé uveď:

- select owner,
- mutation owner,
- RPC owner,
- realtime owner,
- row mapper,
- cache/snapshot owner,
- optimistic update owner,
- error mapping owner,
- zda po mutaci probíhá full reload,
- kolik různých modulů přistupuje ke stejné tabulce.

## 4. Repository rozhraní

Posuď stávající repository interfaces.

Cílem jsou operace orientované na doménu, například:

```ts
interface MealsRepository {
  listMealLibrary(scope: FamilyScope): Promise<Meal[]>
  createMeal(input: CreateMealInput): Promise<Meal>
  updateMealDetails(id: MealId, patch: MealPatch): Promise<Meal>
  planMeal(input: PlanMealInput): Promise<MealPlanEntry>
  recordVote(input: RecordMealVoteInput): Promise<MealVoteResult>
}
```

Ne:

```ts
repository.create(table, row)
repository.update(table, id, patch)
```

U každé domény navrhni minimální rozhraní odpovídající skutečným workflows.

## 5. Row/domain mappers

Najdi místa, kde se Supabase row typy:

- mapují opakovaně,
- používají přímo v UI,
- obsahují snake_case mimo data layer,
- nekonzistentně parsují datum/čas,
- nekonzistentně řeší nullable hodnoty,
- vytvářejí různé domain shape pro stejnou entitu.

Navrhni jediného vlastníka mapperu pro každou tabulku/aggregate.

Mapper musí být:

- čistá funkce,
- testovatelný,
- timezone-aware,
- explicitní u nullable polí,
- bezpečný pro neočekávaná data.

## 6. Error taxonomy

Zmapuj raw Supabase/PostgREST/RPC chyby pronikající do feature/UI vrstvy.

Navrhni normalizované error codes, například:

```ts
type RepositoryErrorCode =
  | 'network-offline'
  | 'backend-unavailable'
  | 'auth-expired'
  | 'permission-denied'
  | 'not-found'
  | 'conflict'
  | 'validation-failed'
  | 'rate-limited'
  | 'storage-failed'
  | 'unknown'
```

Repository má vracet bezpečný doménový error s:

- code,
- retryable,
- operation,
- safe message key,
- původní cause pouze pro interní logging.

UI nemá parsovat raw Postgres message text.

## 7. Application services

Najdi workflows přes více modulů, například:

- vytvoření opakované aktivity + participants + assignment history,
- plánování jídla + případné přidání ingrediencí do nákupu,
- schválení úkolu + allowance ledger,
- reminder sync přes více zdrojových domén,
- vytvoření/archivace člena + související settings/data cleanup.

Navrhni application services pouze tam, kde jedna operace skutečně koordinuje více repositories.

Service nesmí být nový god-object.

## 8. Mutation → refresh audit

Najdi všechny patterns:

```text
mutation
→ refresh celé tabulky
→ refresh souvisejících tabulek
```

U každého zhodnoť:

- zda server vrací dost dat pro targeted update,
- zda lze použít optimistic patch,
- zda realtime echo může provést reconciliation,
- zda je full refresh nutný kvůli server-side side effects,
- zda hrozí duplicate apply mezi optimistic a realtime.

Navrhni jednotný reconciliation postup:

```text
optimistic local patch
→ server response merge
→ realtime echo dedupe
→ targeted invalidation pouze dotčených aggregate
```

Neimplementuj optimistic update tam, kde nelze bezpečně určit rollback nebo idempotency.

## 9. Doporučené pořadí migrace

Audit musí připravit samostatné implementační plány v tomto pořadí:

1. Meals, meal plan a voting.
2. Activities + occurrence assignments/history.
3. Reminders.
4. Family members/settings + allowance.

Shopping a Calendar nepřepisuj, pokud již používají vyspělejší offline repository pattern. Použij je jako referenci pouze tam, kde je pattern přenositelný bez offline cargo cultu.

## 10. Prioritizace

Každý nález označ:

- `P0` — riziko datové nekonzistence, duplicate mutation/subscription nebo security boundary,
- `P1` — architektonický dluh s reálným výkonovým/udržovacím dopadem,
- `P2` — cleanup a sjednocení.

Uveď:

- soubory,
- call path,
- aktuálního vlastníka,
- cílového vlastníka,
- riziko,
- migrační kroky,
- testy,
- acceptance criteria.

## Automatický guard

Přidej script a test/CI-ready příkaz, například:

```json
"check:data-access": "node scripts/audit-data-access.mjs --check"
```

Guard má selhat, pokud vznikne nové přímé `.from()`, `.rpc()` nebo `.channel()` volání mimo allowlist.

Musí podporovat i report režim:

```bash
npm run audit:data-access
```

Report ulož jako machine-readable JSON i čitelný Markdown nebo console table.

## Co neimplementovat v auditním PR

- plošnou migraci všech domén,
- generický BaseRepository,
- generický CRUD service,
- nový state-management framework,
- rewrite Shopping/Calendar offline repositories,
- změny RLS bez konkrétního nálezu,
- UI redesign.

## Validace

```bash
npm run lint
npm test
npm run build
npm run check:edge-functions
npm run audit:data-access
npm run check:data-access
git diff --check
```

## Acceptance criteria

- Existuje úplný automaticky reprodukovatelný seznam low-level datových volání.
- Každý select, RPC a subscription má navrženého vlastníka.
- Existuje explicitní allowlist infrastrukturních výjimek.
- Audit navrhuje doménová repository rozhraní, ne generický CRUD.
- Jsou identifikovány row/domain mappers a raw error leaks.
- Jsou popsány cross-module application services.
- Jsou vyčísleny mutation → full refresh patterns.
- Je připraven guard proti novým přímým Supabase callům mimo schválenou vrstvu.

# Rodinka — audit offline režimu, cache vrstev a synchronizačních stavů

Datum: 2026-07-20
Základ: `main` @ `a36c077`
Rozsah: všechny offline, cache, connectivity a synchronizační mechanismy klientské aplikace.

---

## 1. Inventory všech vrstev

### 1.1 Query cache (`src/queryCache.ts`)

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `src/queryCache.ts`, `src/queryCache.test.ts` |
| Storage | `Map` v paměti + IndexedDB `rodinka-query-cache` / store `queries` (jen pro `persist: true`) |
| Scope klíč | `${userId ?? 'anonymous'}::${familyId ?? 'none'}::${stableStringify(key)}` |
| Schema version | `SCHEMA_VERSION = 1`, uloženo v každém záznamu i jako verze DB |
| TTL / max age | `staleTimeMs` per call; `maxAgeMs` default `cacheTimes.gc` = 24 h |
| Zapisovaná data | výsledek `fetcher()` — dnes: seznam členů rodiny (včetně jmen, rolí, dat narození, avatar signed URL), nastavení rodiny (název, hero signed URL, kategorie nákupu) |
| Kdo čte | `useFamilyMembers`, `FamilySettingsContext` |
| Kdo invaliduje | `FamilySettingsContext` (3 místa) přes `invalidateQueryCache()` |
| Logout cleanup | `signOutCurrentAccount()` → `clearQueryCacheScope({ userId })` |
| Citlivá data | **ano** — jména, data narození, role, signed URL k avatarům |
| Quota / storage error | `db()` při chybě resolvuje `null`; `idbGet`/`idbSet` chyby polykají. Quota exceeded se projeví jako tichý neúspěch zápisu. Poškozený záznam (např. `value: undefined`) **není detekován**. |

Detailní nálezy viz sekce 5.

### 1.2 Family / auth bootstrap identity cache

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `src/hooks/useFamily.ts`, `src/shopping/shoppingIndexedDb.ts` (store `shoppingFamilyIdentity`) |
| Storage | IndexedDB `rodinka-offline` v3, keyPath `userId` |
| Scope klíč | `userId` |
| Schema version | žádná (struktura `FamilyMember` bez verze) |
| TTL | žádné — cache je platná neomezeně, dokud ji nepřepíše server |
| Data | jeden `FamilyMember` (jméno, role, family_id, datum narození, gender) |
| Kdo čte | `useFamily.refresh()` — otevírá shell v režimu `cached-validating` |
| Kdo invaliduje | pouze úspěšná serverová odpověď (wholesale replace) |
| Logout cleanup | `signOutCurrentAccount()` → `saveFamilyIdentity(userId, null)` |
| Citlivá data | **ano** |
| Storage error | 3s timeout (`CACHE_TIMEOUT_MS`), chyba → `null`, boot pokračuje |

Pozitivní nález: `useFamily.ts:117-131` už správně rozlišuje síťovou chybu od permission/auth chyby a **nepovolí** cached identitu při RLS/auth chybě. To je přesně chování požadované v acceptance criteria.

### 1.3 Shopping IndexedDB snapshot

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `src/shopping/shoppingIndexedDb.ts`, `src/shopping/shoppingRepository.ts` |
| Storage | IndexedDB `rodinka-offline` v3, stores `shoppingItems`, `shoppingMetadata`, `shoppingTemplates`, `shoppingCategorySettings` |
| Scope klíč | `familyId` (položky `${familyId}:${itemId}`) |
| Schema version | `DB_VERSION = 3` na úrovni databáze; **jednotlivé záznamy verzi nemají** |
| TTL | žádné — snapshot je vždy použitelný |
| Data | položky nákupního seznamu, šablony, nastavení kategorií, `lastSuccessfulSyncAt` |
| Kdo čte | `ShoppingRepository.startLifecycle()` |
| Kdo invaliduje | `replaceItems()` po každém úspěšném syncu |
| Logout cleanup | **nikdo** — viz P0-3 |
| Citlivá data | částečně (obsah nákupního seznamu rodiny) |
| Storage error | `openDatabase()` rejectuje → `repository.start()` catch → `status: 'error'`. Quota při zápisu → `transactionDone` reject → `persistLocal` chain zachytí `.catch(() => undefined)` až u dalšího zápisu. |

### 1.4 Shopping mutation queue

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `src/shopping/shoppingMutationQueue.ts`, `shoppingSync.ts`, store `shoppingMutations` |
| Scope klíč | `familyId`, keyPath `mutationId` |
| Idempotency key | `mutationId` (UUID) — serverová strana má ledger `shopping_sync_mutations` s `pg_advisory_xact_lock`, viz `supabase/migrations/20260715200000_offline_shopping_sync.sql:48-51` |
| Retry / backoff | **žádný explicitní backoff** — retry přes `online` event, `visibilitychange` a `queueMicrotask` |
| Ordering | `createdAt` řazení při načtení; upload sekvenčně |
| Duplicate suppression | klientská koalescence v `enqueueShoppingMutation()` (create+update → jeden create, delete ruší create) |
| Reload survival | ano |
| Logout cleanup | **nikdo** — viz P0-3 |

### 1.5 Calendar IndexedDB snapshot

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `src/calendar/calendarRepository.ts`, store `calendarSnapshots` |
| Scope klíč | `${userId}:${familyId}` (`calendarScopeKey`) |
| Schema version | `CALENDAR_LOCAL_SCHEMA_VERSION = 1`, uloženo v záznamu, při neshodě se scope maže (`shoppingIndexedDb.ts:129-136`) |
| TTL | žádné |
| Data | chores, completions, activities, **medical records**, meal plan, allowance plans, overrides, members |
| Kdo čte | `CalendarRepository.startLifecycle()` |
| Kdo invaliduje | `updateFromProviders()` a `performSync()` |
| Logout cleanup | `clearCalendarUser(userId)` z `signOutCurrentAccount()` |
| Citlivá data | **ano, nejcitlivější vrstva v aplikaci** — zdravotní záznamy |
| Storage error | reject → `persistLocal().catch()` loguje |

Pozitivní nález: jediná vrstva se skutečnou per-record schema verzí a s korektním úklidem podle `userId`.

### 1.6 Calendar mutation queue

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `src/calendar/calendarMutationQueue.ts`, `calendarSync.ts`, store `calendarMutations` |
| Scope klíč | `scopeKey` index, keyPath `operationId` |
| Idempotency key | `operationId` → RPC `apply_calendar_mutation` |
| Retry / backoff | exponenciální, `min(60s, 1000 * 2^min(attempts,6))` (`calendarRepository.ts:376-384`) |
| Ordering | `createdAt` |
| Conflict handling | `classifyCalendarSyncError()` — SQLSTATE 22*/23*/42501/P0001 = permanentní, ostatní retryable |
| Reload survival | ano; `syncing` → `pending` reset při startu (`calendarRepository.ts:97-99`) |
| Logout cleanup | ano |

Nejzralejší queue v aplikaci. Shopping queue by měl konvergovat k tomuto modelu.

### 1.7 Service worker Cache Storage

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `public/sw.js`, `src/push/registerServiceWorker.ts` |
| Cache names | `rodinka-runtime-v2` (app shell + assets), `rodinka-push-config-v1` (VAPID klíč, locale) |
| Scope | origin |
| Versioning | ruční bump `CACHE_NAME`; `activate` maže `rodinka-runtime-*` kromě aktuální |
| Data | `/`, manifest, ikony, `/assets/*`, style/script/image/font requesty |
| Citlivá data | **ne** — Supabase odpovědi se necachují (fetch handler vrací early pro cross-origin, `sw.js:21`) |
| Update aktivace | žádný `skipWaiting`/`clients.claim` → nová verze se aktivuje až po zavření všech tabů |

### 1.8 Push config cache

`rodinka-push-config-v1` drží `/__push-config` (VAPID public key) a `/__app-locale`. Není user-scoped a při logoutu se nemaže — VAPID public key je veřejný, locale není citlivá; **není to nález**, jen to není nikde zdokumentováno.

### 1.9 Family Jump local state

| Vlastnost | Hodnota |
| --- | --- |
| Soubory | `src/features/family-jump/storage/records.ts` |
| Storage | `localStorage`, klíč `rodinka.family-jump.records.v1.${familyId}` + in-memory fallback |
| Schema version | `version: 1` v payloadu |
| Data | mapa `memberId → nejlepší skóre` |
| Logout cleanup | **nikdo** — viz P1-2 |
| Citlivá data | slabě (memberId + skóre) |

### 1.10 Ostatní

- **Conversation presence** (`src/push/conversationPresence.ts`) — serverový stav, žádná lokální cache. Při logoutu se explicitně nečistí (heartbeat prostě přestane).
- **Realtime status store** (`src/realtime/realtimeStatusStore.ts`) — modul-level `Map`, přežije logout, ale unsubscribe providerů ho vyprázdní.
- **Draft / preference storage** — v repozitáři nenalezeno.

---

## 2. Data ownership matrix

| Entita | Server SoT | Lokální snapshot | Mutation queue | Query cache | Realtime patching | Conflict strategy | Offline edit | Reconnect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| members | `members` | calendar snapshot (`data.members`) + shopping `shoppingFamilyIdentity` | — | **ano** (`members` key) | `FamilyMembersContext` | last-write-wins ze serveru | ne | refetch |
| family settings | `families` | `shoppingCategorySettings` | — | **ano** (`settings` key) | `FamilySettingsProvider` | server wins | ne | refetch |
| chores | `chores` | calendar snapshot | calendar queue (`create_chore`) | — | `ChoresContext` | server wins, lokální create přežívá do potvrzení | **create only** | replay queue → refetch |
| activities | `activities` | calendar snapshot | calendar queue (`create_activity`) | — | `ActivitiesContext` | dtto | **create only** | dtto |
| medical records | `medical_records` | calendar snapshot | — | — | `MedicalContext` | server wins | ne | refetch |
| meals / meal plan | `meals`, `meal_plan_entries` | calendar snapshot (planEntries) | — | — | `MealsContext` | server wins | ne | refetch |
| shopping | `shopping_items` | shopping snapshot | shopping queue | — | `shoppingRealtime` | server ledger idempotence + klientská koalescence | **plné CRUD** | replay → fetch |
| messages | `messages` | — | — | — | `MessagesSummaryContext` | n/a | ne | refetch |
| reminders | `reminders` | — | — | — | `ReminderContext` | n/a | ne | refetch |
| Family Jump scores | `family_jump_records` | `localStorage` | — | — | ne | merge max(local, remote) | **ano** | merge sync |

### Entity ve více vrstvách bez jasného vlastníka

1. **`members`** existují ve **třech** vrstvách: query cache (`persist: true`, 11h max age), calendar snapshot (`data.members`), a shopping `shoppingFamilyIdentity` (jen aktuální člen). Tři nezávislé kopie s odlišnou TTL a odlišným úklidem. Calendar snapshot navíc plní `updateFromProviders()` z `FamilyMembersContext`, který sám čte z query cache — takže calendar snapshot může persistovat data, která query cache už považuje za stale.
2. **`shoppingCategorySettings`** existují dvakrát: v query cache pod klíčem `settings` a samostatně v `shoppingCategorySettings` store. `FamilySettingsContext` zapisuje do obou a čte z obou (IDB jako pre-network fallback). Vlastník je de facto query cache, ale IDB kopie se nikdy neinvaliduje nezávisle.
3. **`medicalRecords`** jsou v calendar snapshotu, ale medical modul nemá offline edit — snapshot je čistě read-only kopie. To je v pořádku, ale znamená to, že nejcitlivější data v aplikaci leží v IndexedDB kvůli feature (kalendář), která je přímo nepotřebuje k zápisu.

---

## 3. Connectivity model

### 3.1 Zdroje connectivity stavu (dnes: 7 nezávislých)

| Zdroj | Soubor | Typ |
| --- | --- | --- |
| `navigator.onLine` přímo | `AppShell.tsx:55`, `TodayDashboard.tsx:268`, `useTodayDashboardData.ts:51`, `CalendarOfflineContext.tsx:22`, `useShoppingDataSource.ts:42`, `FamilyScreen.tsx:126`, `childAccountAdmin.ts:75` | boolean |
| `useNetworkStatus()` | `App.tsx:33`, `useFamilyJumpRecords.ts:16` | `'checking' \| 'online' \| 'offline'` |
| `isNetworkUnavailableError()` | `useFamily.ts:119`, `useSession.ts:89`, `useFamilyJumpRecords.ts:50` | klasifikace chyby |
| shopping sync status | `ShoppingContext` | `'offline' \| 'syncing' \| 'synced' \| 'error'` |
| calendar sync status | `CalendarOfflineContext` | dtto |
| realtime status | `realtimeStatusStore` | `'connected' \| 'connecting' \| 'reconnecting' \| 'disconnected'` |
| startup connection error | `useFamily().connectionError` → `App.tsx` `OfflineStartupGate` | `string \| null` |

Repository třídy si navíc drží **vlastní** `isOnline()` closure (`shoppingRepository.ts:78`, `calendarRepository.ts:55`), každá se svým `navigator.onLine` čtením a svým `window.addEventListener('online')`.

### 3.2 Místa, kde UI přímo skládá více stavů

**`AppShell.tsx:54-61`** — nejhorší případ:
```ts
const offlineMode = shoppingSyncStatus === 'offline' || calendarSyncStatus === 'offline'
const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine
const realtimeInterrupted = realtimeStatus === 'reconnecting' || realtimeStatus === 'disconnected'
```
Tři různé zdroje, ručně slepené do `connectionInterrupted`. `navigator.onLine` se čte při renderu bez subscription — hodnota se nikdy neaktualizuje, pokud AppShell nerenderuje z jiného důvodu.

**`TodayDashboard.tsx:268`** — identická logika, duplikovaná.

**`useTodayDashboardData.ts:51`** — potřetí.

**`AppShell.tsx:62`** — `offlineBlocked = offlineMode && definition.offline === 'blocked'`. Protože `offlineMode` zahrnuje `shoppingSyncStatus === 'offline'`, může selhání *jednoho* feature repository zablokovat nesouvisející route. Feature stav se prosakuje do globálního rozhodnutí.

### 3.3 Navržený jednotný model

```ts
type ConnectivityState = 'online' | 'degraded' | 'offline'
```

- `offline` — **jen** `navigator.onLine === false`. Žádný jiný signál sem nesmí přispět.
- `degraded` — browser online, ale realtime je `reconnecting`/`disconnected`, nebo poslední backend request selhal síťově/timeoutem.
- `online` — browser online a nic nehlásí problém.

Implementováno jako `useConnectivity()` (viz sekce Implementace, B). Klíčové pravidlo, které dnes porušeno je: **backend chyba nesmí přepnout aplikaci do `offline`** a **`navigator.onLine === true` není důkaz, že Supabase funguje**.

---

## 4. Feature sync model

Dnes má každý modul vlastní tvar snapshotu:

| Feature | Status typ | Pending count | Last synced | Error kód |
| --- | --- | --- | --- | --- |
| shopping | `ShoppingSyncStatus` | `pendingCount` | `lastSuccessfulSyncAt` | volný string (`error.message`!) |
| calendar | `CalendarSyncStatus` | `mutations.length` | `lastSuccessfulSyncAt` | volný string |
| Family Jump | `FamilyJumpSyncStatus` (5 hodnot) | — | — | — |
| messages | žádný | — | — | — |
| reminders | žádný | — | — | — |

`shoppingRepository.ts:202` propouští **raw Supabase message** do snapshotu a odtud do UI. To je přesně to, čemu má error taxonomy zabránit.

Navržený společný tvar (implementován v `src/sync/featureSyncRegistry.ts`):

```ts
type FeatureSyncState = 'idle' | 'syncing' | 'pending' | 'error'

interface FeatureSyncSnapshot {
  feature: string
  state: FeatureSyncState
  pendingCount: number
  lastSyncedAt: string | null
  lastErrorCode: string | null
  retryable: boolean
}
```

**Doporučení k rozsahu:** registry zahrnout **shopping a calendar** (obě mají skutečnou queue) a **Family Jump** (má lokální stav a merge sync). Messages a reminders **nezahrnovat** — jsou online-only a registry by je nutil předstírat queue, kterou nemají. To je explicitně v zadání zakázáno.

---

## 5. Query cache audit

### Hypotéza z zadání — POTVRZENA, P0

`invalidateQueryCache()` (`queryCache.ts:101-105`) maže **pouze `memory`**. IndexedDB záznam zůstává.

Reprodukce:
1. `cachedQuery({ persist: true, staleTimeMs: 45min })` — zapíše memory + IDB.
2. `updateFamilyName()` → `invalidateQueryCache()` — smaže jen memory.
3. Reload stránky (memory je prázdná).
4. `cachedQuery()` znovu → `memory.get()` miss → `idbGet()` **hit** → `updatedAt` je stále v rámci `staleTimeMs` → vrátí se **stará data jako `cacheHit: true, stale: false`**.

Uživatel po přejmenování rodiny a reloadu vidí až 45 minut starý název. Totéž pro `shoppingCategorySettings` a hero image.

### Další nálezy v této vrstvě

**P0-2 — prefix collision při invalidaci.** `queryCache.ts:102`:
```ts
const prefix = `${scopeKey(scope)}::${stableStringify(prefixKey).slice(0, -1)}`
```
`stableStringify(['family','f1','members'])` = `["family","f1","members"]`, po `slice(0,-1)` = `["family","f1","members"`. Klíč `['family','f1','members-archive']` se stringifikuje na `["family","f1","members-archive"]`, což **tímto prefixem začíná**. Invalidace `members` tedy zasáhne i `members-archive`. Opačně: `['family','f1','member']` prefix `["family","f1","member"` zasáhne `members` — invalidace kratšího jména smete delší. String-prefix nad JSON je pro tento účel principiálně nespolehlivý.

**P0-3 — `scope: { userId: null }` obchází logout cleanup.** `FamilySettingsContext.tsx:61` používá `scope: { userId: null, familyId }` → scopeKey `anonymous::${familyId}`. `clearQueryCacheScope({ userId })` v `signOutCurrentAccount` staví prefix `${userId}::` — **nikdy nematchne `anonymous::`**. Nastavení rodiny (název, hero signed URL, kategorie) tedy **přežije logout v IndexedDB i v paměti**. Uživatel B na stejném zařízení, který se přihlásí do stejné rodiny, uvidí cache uživatele A; a i po odebrání z rodiny zůstává hero signed URL v IDB až 11 hodin.

**P1-1 — in-flight request po invalidaci vrátí stará data jako fresh.** `cachedQuery` sdílí `inflight` promise podle klíče. Pokud během běžícího fetche přijde `invalidateQueryCache()`, běžící promise doběhne a `queryCache.ts:125-126` zapíše výsledek s `updatedAt: now()` — tedy **předinvalidační data označená jako čerstvá**. Invalidace je ztracena.

**P1-2 — `clearQueryCacheScope({ userId })` je correct, ale křehký.** Prefix `${userId}::` funguje pro všechny rodiny uživatele, protože scopeKey je `userId::familyId::...`. UUID mají fixní délku, takže prefix collision mezi uživateli reálně nehrozí. Nicméně to závisí na tom, že `userId` je vždy UUID — u `'anonymous'` to neplatí a `clearQueryCacheScope({ userId: null })` by smazalo všechny `anonymous::` záznamy napříč rodinami.

**P1-3 — stará schema verze se neuklidí.** `db()` otevírá `indexedDB.open(DB_NAME, SCHEMA_VERSION)`. Při bumpu verze `onupgradeneeded` volá `createObjectStore(STORE)`, což **selže**, protože store už existuje → `request.onerror` → `resolve(null)` → **persistence je od té chvíle trvale vypnutá**, tiše. Zároveň se staré záznamy nikdy nesmažou. Kontrola `existing?.schemaVersion === SCHEMA_VERSION` v `cachedQuery` sice starý záznam nepoužije, ale nechá ho ležet.

**P2-1 — signed URL mohou přežít svou platnost.** `AVATAR_SIGNED_URL_SECONDS = 12h`, ale `maxAgeMs = 11h` a `staleTimeMs = cacheTimes.stable = 45 min`. Rozpětí je záměrné a **správně dimenzované** (11 < 12). Riziko je jen v tom, že to nikde není vynucené — změna jedné konstanty bez druhé tiše rozbije avatary. Stejně `FAMILY_HERO_SIGNED_URL_SECONDS`.

**P2-2 — poškozený IDB záznam není detekován.** `idbGet` vrátí cokoli, co je ve storu. Záznam bez `value`/`updatedAt` (např. po částečném zápisu nebo po ruční manipulaci) projde kontrolou `existing?.schemaVersion === SCHEMA_VERSION` jen pokud má schemaVersion; jinak propadne na fetch — což je bezpečné. Ale `now() - existing.updatedAt` s `updatedAt: undefined` dá `NaN`, `NaN <= x` je `false`, takže i to propadne na fetch. **Chování je náhodně bezpečné, ne záměrně.**

---

## 6. Logout a account-switch audit

Flow: `MoreScreen.tsx:366` → `signOutCurrentAccount({ userId, clearCalendarAccount })`.

| Vrstva | Vyčištěna? | Kde |
| --- | --- | --- |
| query cache (memory + IDB), scope `userId::` | ✅ | `clearQueryCacheScope({ userId })` |
| query cache, scope `anonymous::` (family settings) | ❌ **P0-3** | nikde |
| calendar snapshot | ✅ | `clearCalendarAccount()` → `clearCalendarUser(userId)` |
| calendar queue | ✅ | dtto |
| **shopping snapshot** | ❌ **P0-4** | nikde |
| **shopping mutation queue** | ❌ **P0-4** | nikde |
| **shopping templates / category settings** | ❌ **P0-4** | nikde |
| family identity cache | ✅ | `saveFamilyIdentity(userId, null)` |
| push subscription association | ✅ | `releasePushOnSignOut()` |
| conversation presence | ⚠️ | serverový stav; heartbeat přestane, ale explicitní `clearConversationPresence` se nevolá |
| active conversation | ✅ | remount přes `key={scopeKey}` v `App.tsx:106` |
| **Family Jump local records** | ❌ **P1-2** | localStorage přežije |
| temporary signed URL metadata | ❌ | součást P0-3 (v query cache) a shopping snapshotu |

### P0-4 — shopping data přežijí logout i přepnutí účtu

Shopping stores jsou klíčované **výhradně `familyId`**, nikoli `userId`. `signOutCurrentAccount` je nemaže vůbec. Scénář:

1. Uživatel A (rodina F) přidá položky do nákupního seznamu, část offline → queue.
2. Logout.
3. Uživatel B se přihlásí na stejném zařízení a je členem téže rodiny F.
4. `ShoppingRepository.startLifecycle()` načte snapshot **i pending queue uživatele A** a při prvním syncu je odešle **pod identitou uživatele B**.

Mutace projdou (RLS kontroluje jen členství v rodině, `apply_shopping_mutation` bere `actor_id` z `auth.uid()`), takže položky vytvořené A budou na serveru připsány B. Navíc: pokud B **není** členem F, RLS odmítne, queue se zasekne v `error` a pending count z cizí rodiny zůstane viset v UI.

Ještě horší varianta: mezi krokem 2 a 3 je okno, kdy `ShoppingProvider` ještě běží se starým `familyId` — `App.tsx` sice remountuje přes `key={scopeKey}`, ale queue se načítá z IDB znovu podle `familyId`, takže remount problém neřeší.

### Chybějící vlastnosti cleanup workflow

- Cleanup běží v `Promise.all` (`signOutCurrentAccount.ts:19-23`) — **první rejectnutá větev shodí celý blok** a zbylé vrstvy se nevyčistí. Má běžet `allSettled`.
- Žádný timeout — zaseknuté IndexedDB (např. blokovaná `versionchange` transakce) zablokuje logout na neurčito.
- Realtime subscriptions se ruší až při unmountu providerů, tedy **po** `supabase.auth.signOut()`. Krátké okno, kdy běží kanály bez platného tokenu.

---

## 7. Mutation queue audit

### Shopping

| Aspekt | Stav |
| --- | --- |
| Item schema | `{ mutationId, familyId, type, itemId, payload, createdAt }` — **chybí `userId`, `attempts`, `status`, `retryable`, `error`** |
| Idempotency | ✅ serverový ledger |
| Optimistic ID | klientské UUID = finální serverové ID |
| Retry count | ❌ neexistuje |
| Backoff | ❌ žádný — retry jen na `online`/`visibilitychange`/`queueMicrotask` |
| Ordering | ✅ `createdAt` |
| Duplicate suppression | ✅ klientská koalescence |
| Reload survival | ✅ |
| Conflict handling | ❌ žádná klasifikace — každá chyba vrátí celou dávku do queue a nastaví `status: 'error'` |
| Discard / correct flow | ❌ **neexistuje** — trvale selhávající mutace (např. validační chyba) se retryuje donekonečna a uživatel ji nemůže zahodit |
| Auth expiry | mutace se vrátí do queue, sync selže, retry na dalším eventu |
| Family/member removal | RLS odmítne, mutace uvízne navždy |

**P1-3 — ztráta pořadí při souběžném selhání.** `shoppingRepository.ts:193`: `this.mutations = [...uploading, ...this.mutations]`. Mutace, které vznikly *během* selhaného syncu, se ocitnou **za** vracenými. Pokud uživatel offline vytvořil položku a pak ji smazal, a create byl v `uploading` zatímco delete přišel mezitím, pořadí zůstane správné. Ale při dvou po sobě jdoucích selháních se pořadí může prohodit, protože `enqueueShoppingMutation` se na vrácené dávce **nespouští** — koalescence se obejde a v queue mohou být dvě `update` mutace pro tentýž item.

**P1-4 — částečně odeslaná dávka se odešle znovu celá.** `synchronizeShopping()` (`shoppingSync.ts:46`) jede sekvenčně; když selže třetí z pěti, catch vrátí do queue **všech pět**. První dvě už na serveru jsou. Zachrání to serverový ledger (`mutationId` je stabilní), takže duplicity nevzniknou — ale je to náhoda vyplývající z toho, že se `mutationId` při retry nemění. Kdyby se kdykoli začal generovat nový, vzniknou duplicitní položky.

### Calendar

Výrazně zralejší: `attempts`, `status`, `retryable`, `error` v item schema; exponenciální backoff; `classifyCalendarSyncError`; `retry(localId)` i `discard(localId)`; reset `syncing → pending` při startu.

**P2-3** — `performSync` při retryable chybě `throw`ne z vnitřního loopu (`calendarRepository.ts:177`) a přeskočí zbylé mutace. Záměrné (nemá smysl pokračovat, když je síť pryč), ale znamená to, že jedna trvale retryable chyba blokuje frontu za sebou.

### Race conditions

| Dvojice | Riziko | Ochrana dnes |
| --- | --- | --- |
| manual retry × automatic sync | shopping: `syncPromise` guard ✅; calendar: `syncPromise` guard ✅ | ok |
| `online` event × periodic refresh | shopping: `onlineListener` → `sync()` → guard ✅ | ok |
| realtime event × sync | `ensureRealtime` callback → `sync()` → guard ✅ | ok |
| **provider remount × in-flight sync** | shopping: `stop()` zvýší `lifecycle`, `isActive()` zamezí zápisu ✅. **Ale `inFlightMutations` se při stopu ztratí** — mutace, které byly ve vzduchu, nejsou v `this.mutations` a nejsou persistovány jako pending. `persistLocal` je sice zapisuje (`shoppingRepository.ts:313`), ale poslední `persistLocal` proběhl **před** `this.mutations = []`, takže na disku jsou. ✅ náhodou | ok, ale nezáměrně |
| **`online` event × `online` event** (dvojité vyvolání) | queue guard drží ✅, plus serverová idempotence | ok |
| calendar `updateFromProviders` × `performSync` | oba zapisují `this.serverData` bez zámku. `performSync` čte `serverData` až po awaitu; `updateFromProviders` může mezitím zapsat. Poslední zápis vyhrává, obojí jsou serverová data → **benigní** | ok |

Závěr: duplicate server records při opakovaném reconnectu **nehrozí**, díky serverovým ledgerům. To je nejsilnější část současné architektury.

---

## 8. Service worker audit

| Aspekt | Stav |
| --- | --- |
| App-shell caching | ✅ `install` → `cache.addAll(APP_SHELL)`; přeskočeno na localhost |
| Navigation fallback | ✅ network-first s fallbackem na `/`, jinak 503 s lokalizovanou hláškou |
| Runtime asset cache | ✅ cache-first pro `/assets/*` a style/script/image/font |
| Cache versioning | ⚠️ ruční `CACHE_NAME = 'rodinka-runtime-v2'` |
| Update activation | ⚠️ žádný `skipWaiting`/`clients.claim` |
| Stale asset cleanup | ⚠️ `activate` maže staré *cache buckety*, ale **ne stale položky uvnitř aktuálního bucketu**. Viz P1-5 |
| Offline cold start | ✅ funguje proti cachovanému shellu |
| Push handling | ✅ včetně presence probe a `pushsubscriptionchange` |
| Deep links | ✅ `safeDeepLink` validuje same-origin a scope |
| pushState router interakce | ✅ `notificationclick` posílá `postMessage` místo `client.navigate()`, aby nezahodil stav |
| **Authenticated Supabase response v Cache Storage** | ✅ **nedochází k tomu** — `sw.js:21` vrací early pro cross-origin |

**P1-5 — cache-first pro `/assets/*` bez revalidace při novém deploymentu.** Vite generuje hashované názvy, takže nový build = nové URL a cache-first je správně. Ale staré hashované soubory zůstávají v `rodinka-runtime-v2` navždy — cache jen roste. `activate` je nemaže, protože `CACHE_NAME` se nemění. Po mnoha deploymentech to může narazit na quotu; v tu chvíli `cache.put()` tiše selže (není v `try`) a `event.respondWith` dostane rejectnutou promise → **failed fetch místo assetu**.

**Update-ready UI**: bez `skipWaiting` se nová verze aktivuje až po zavření všech tabů. U PWA na mobilu, kde tab nikdy nezmizí, může uživatel běžet na staré verzi týdny. Má to hodnotu, **ale v tomto batchi to neimplementuji** — zadání to explicitně nechává na posouzení a je to samostatná UX změna.

---

## 9. Error taxonomy

Dnes UI dostává:
- raw `error.message` ze Supabase (`shoppingRepository.ts:202` → `shoppingSyncError` → UI),
- volný string z `classifyCalendarSyncError` (`calendarSync.ts:36`),
- ad-hoc stringy `'realtime-unavailable'`, `'initialization-failed'`, `'calendar-mutation-failed'`, `'calendar-unavailable'`, `'shopping-unavailable'`, `'offline'`.

Navržený uzavřený výčet (implementován v `src/errors/errorCodes.ts`):

| Kód | Kdy | Retryable |
| --- | --- | --- |
| `network-offline` | `navigator.onLine === false` | ano |
| `backend-unavailable` | fetch failure, 5xx, DNS | ano |
| `request-timeout` | `AbortError` / vlastní timeout | ano |
| `auth-expired` | 401, `jwt`, `session` | ne (vyžaduje re-auth) |
| `permission-denied` | 403, `42501`, RLS | **ne — nikdy nesmí odemknout cached data** |
| `not-found` | `PGRST116`, 404 | ne |
| `conflict` | `23505`, `23503` | ne |
| `storage-quota` | `QuotaExceededError` | ne |
| `cache-corrupt` | nečitelný / neočekávaný IDB záznam | ne (zahodit a pokračovat) |
| `mutation-failed` | `22*`, `P0001`, validace | ne |
| `realtime-disconnected` | realtime kanál down | ano |
| `unknown` | vše ostatní | ano |

---

## 10. Prioritizace nálezů

### P0

| ID | Nález | Soubory | Reprodukce | Riziko | Oprava |
| --- | --- | --- | --- | --- | --- |
| **P0-1** | `invalidateQueryCache()` nemaže IndexedDB | `queryCache.ts:101-105` | invalidovat → reload → cachedQuery vrátí stará data jako fresh | Uživatel vidí stará data až 45 min po vlastní změně | Mazat i z persistence; strukturované klíče |
| **P0-2** | String-prefix collision při invalidaci | `queryCache.ts:102` | klíče `members` a `members-archive` ve stejném scope | Invalidace zasáhne příliš mnoho nebo (u kratšího jména) smete nesouvisející entitu | Porovnávat pole klíčů element po elementu |
| **P0-3** | `scope: { userId: null }` obchází logout cleanup | `FamilySettingsContext.tsx:61`, `signOutCurrentAccount.ts:22` | A přihlášen → logout → B přihlášen do stejné rodiny | Nastavení rodiny + hero signed URL uživatele A přežijí logout | Předat skutečné `userId` do scope |
| **P0-4** | Shopping snapshot a queue přežijí logout | `signOutCurrentAccount.ts`, `shoppingIndexedDb.ts` | A vytvoří offline položky → logout → B přihlášen | Data A se zobrazí B; pending mutace A se odešlou pod identitou B | Explicitní `clearShoppingUser` v cleanup workflow |
| **P0-5** | Cleanup je `Promise.all` — jedna chyba shodí zbytek | `signOutCurrentAccount.ts:19-23` | selhání IDB write | Částečný cleanup, zbylé vrstvy nedotčené | `allSettled` + per-vrstva timeout |

### P1

| ID | Nález | Soubory | Riziko | Oprava |
| --- | --- | --- | --- | --- |
| P1-1 | In-flight fetch po invalidaci zapíše stará data jako fresh | `queryCache.ts:118-127` | Invalidace se ztratí | Epocha invalidace per klíč |
| P1-2 | Family Jump localStorage přežije logout | `records.ts` | Skóre předchozího účtu | Přidat do cleanup workflow |
| P1-3 | Shopping queue obchází koalescenci při vrácení dávky | `shoppingRepository.ts:193` | Duplicitní `update` mutace v queue | Vrácenou dávku prohnat `enqueueShoppingMutation` |
| P1-4 | Shopping queue nemá `attempts`/`status`/`discard` | `shoppingMutationQueue.ts` | Trvale selhávající mutace se nedá zahodit | Konvergovat ke calendar schématu (mimo tento batch) |
| P1-5 | SW asset cache jen roste, quota failure není ošetřen | `sw.js:30-41` | Po zaplnění quoty selže načtení assetu | `try/catch` kolem `cache.put` |
| P1-6 | Schema bump query cache tiše vypne persistenci | `queryCache.ts:60-66` | Persistence trvale mrtvá bez signálu | Guard `objectStoreNames.contains` |
| P1-7 | `AppShell.offlineBlocked` bere feature stav jako globální | `AppShell.tsx:54,62` | Selhání shopping repository zablokuje nesouvisející route | Použít centralizovaný connectivity snapshot |

### P2

| ID | Nález | Soubory |
| --- | --- | --- |
| P2-1 | Signed URL TTL vs. `maxAgeMs` není vynuceno kódem | `useFamilyMembers.ts:43,63`, `FamilySettingsContext.tsx:12,63` |
| P2-2 | Poškozený IDB záznam propadne na fetch jen náhodou | `queryCache.ts:110-116` |
| P2-3 | Calendar retryable chyba blokuje frontu za sebou | `calendarRepository.ts:177` |
| P2-4 | `members` žijí ve třech vrstvách bez jasného vlastníka | viz sekce 2 |
| P2-5 | Prázdné re-export shimy `src/repositories/shopping/*` | `src/repositories/shopping/` |
| P2-6 | Žádné update-ready UI pro nový SW | `sw.js` |

---

## Co bylo v tomto batchi opraveno

Detailně: [`docs/implementation/P0_OFFLINE_CACHE_SYNC_BATCH_1.md`](../implementation/P0_OFFLINE_CACHE_SYNC_BATCH_1.md).

Opraveno: **P0-1, P0-2, P0-3, P0-4, P0-5, P1-1, P1-2, P1-3, P1-5, P1-6, P1-7**.

Odloženo do samostatného batche: **P1-4** (přepis shopping queue schématu do podoby calendar queue — `attempts`/`status`/`retryable`/`discard`), **P2-3** (retryable chyba blokuje calendar frontu), **P2-5** (prázdné shimy), **P2-6** (update-ready UI).

Poznámka k **P2-1**: vztah `AVATAR_SIGNED_URL_SECONDS` (12 h) > `maxAgeMs` (11 h) zůstává konvencí, nikoli vynuceným invariantem. Kandidát na contract test.

Poznámka k `shoppingCategorySettings`: tento store zůstává klíčovaný pouze `familyId`. Je to konfigurace rodiny (názvy a pořadí kategorií), ne uživatelská data, a logout ho nemaže. Pokud by se do něj někdy dostalo cokoli osobního, musí přejít pod `userId:familyId` jako zbytek shopping vrstvy.

# P0 offline / cache / sync — stabilizační batch 1

Audit: [`docs/audits/OFFLINE_CACHE_SYNC_AUDIT.md`](../audits/OFFLINE_CACHE_SYNC_AUDIT.md)
Základ: `main` @ `a36c077`

Cílem batche nebyl přepis offline architektury, ale sjednocení zdrojů pravdy a oprava nálezů, u kterých hrozí zobrazení cizích nebo zastaralých dat.

## A. Persistentní invalidace query cache

`src/queryCache.ts` — přepsáno.

- **P0-1**: `invalidateQueryCache()` i `clearQueryCacheScope()` nyní mažou i persistentní vrstvu, ne jen `memory`.
- **P0-2**: klíč se skládá z **NUL-terminovaných segmentů** (`encodeSegments`), takže string prefix je zároveň strukturní prefix. `"members"\0` už není prefixem `"members-archive"\0` ani naopak. Nahrazuje křehký `stableStringify(key).slice(0, -1)`.
- **P1-1**: každý klíč má invalidační epochu. Fetch si zapamatuje epochu při startu; pokud ji invalidace mezitím zvýší, výsledek se předá volajícímu, ale **neuloží** se jako aktuální hodnota.
- **P1-6**: `onupgradeneeded` už nevolá `createObjectStore` bezpodmínečně — bump schema verze tedy tiše nevypne persistenci na celou session.
- **E**: `isUsableEntry()` zahodí nečitelný záznam; každé volání persistence má `.catch()`, takže quota, zavřená DB ani chybějící store nezpůsobí selhání čtení — degraduje se na „žádná cache".
- Persistence je za rozhraním `QueryCachePersistence`; `createMemoryQueryCachePersistence()` slouží jako test adaptér.

Testy: `src/queryCachePersistence.test.ts` (8 scénářů, včetně naplnit → remount → invalidovat → ověřit fetch).

## B. Centralizovaný connectivity snapshot

Nový `src/network/connectivity.ts` — `useConnectivity()` / `useConnectivityState()`.

```ts
type ConnectivityState = 'online' | 'degraded' | 'offline'
```

- `offline` může vyhlásit **jen** browser. Backend chyba nikdy.
- `degraded` = browser online, ale realtime je down nebo backend nedosažitelný.
- `reportBackendOutcome()` přijímá **klasifikovaný kód**, ne raw error — permission/auth chyba tedy nemůže degradovat globální stav.

Nahrazeno v `AppShell.tsx` (**P1-7**: `offlineBlocked` už nezávisí na feature stavu, takže zaseknutá shopping queue neblokuje nesouvisející route), `TodayDashboard.tsx` a `useTodayDashboardData.ts`. Feature-specific sync indikace zůstala feature-level.

Testy: `src/network/connectivity.test.ts`, aktualizovaný `src/realtimeStatusBoundaryContract.test.ts`.

## C. Feature sync aggregator

Nový `src/sync/featureSyncRegistry.ts`. Read-only agregace nad **shopping** a **calendar**; repository si drží vlastní implementaci, registry jen adaptuje jejich existující snapshoty (`adaptRepositorySync`).

Messages a reminders **záměrně nezahrnuty** — jsou online-only a registry by je nutil předstírat mutation queue.

Testy: `src/sync/featureSyncRegistry.test.ts`.

## D. Logout a account-switch hardening

- **P0-4**: shopping IndexedDB překlíčováno z `familyId` na `userId:familyId` (DB v4). Legacy řádky bez `userId` se při upgradu zahodí — nelze je přiřadit k účtu a jsou plně re-syncovatelné. Přidán `clearShoppingUser(userId)`.
- **P0-3**: `FamilySettingsProvider` dostává `userId` a cachuje pod skutečným uživatelem místo `anonymous::`, který `clearQueryCacheScope({ userId })` nikdy nezasáhl.
- **P0-5**: nový `src/auth/accountCleanup.ts` — `Promise.allSettled` místo `Promise.all`, per-krok timeout 4 s, strukturovaný výsledek. Selhání jedné vrstvy nezastaví ostatní a nezablokuje logout.
- **P1-2**: `clearFamilyJumpRecords()` maže localStorage skóre.
- Realtime kanály jdou dolů přes `clearCalendarAccount()` **před** `supabase.auth.signOut()`.

Testy: `src/auth/accountCleanup.test.ts`, `src/shopping/shoppingAccountSwitch.test.ts`, rozšířený `src/auth/signOutCurrentAccount.test.ts`.

## E. Error taxonomy

Nový `src/errors/errorCodes.ts` — uzavřený výčet 12 kódů, `classifyAppError()`, `isRetryableErrorCode()`, `deniesCachedData()`.

Klíčová vlastnost: **permission/auth se klasifikuje před connectivity**, takže 403 s vypnutou sítí zůstane `permission-denied` a nikdy neodemkne offline fallback nad cached family daty.

`ShoppingRepositorySnapshot.error` je nyní `AppErrorCode | null` místo volného stringu — raw Supabase message se do UI nedostane.

Testy: `src/errors/errorCodes.test.ts`.

## F. Development diagnostics

Nový `src/diagnostics/offlineDiagnostics.ts` + rozšířené `[Rodinka query-cache]` logy. Vše za `import.meta.env.DEV`. Loguje se pouze počty, kódy a stavy — **žádný obsah záznamů, jména, zprávy, zdravotní data ani tokeny**.

## Ostatní

- **P1-3**: vrácená dávka shopping mutací po selhaném syncu prochází `enqueueShoppingMutation`, takže v queue nemohou zůstat dvě `update` mutace pro tutéž položku.
- **P1-5**: `cache.put()` v service workeru je v `try/catch` — zaplněná quota už neshodí načtení assetu.

## Neprovedeno (samostatný batch)

- **P1-4** — shopping queue nemá `attempts`/`status`/`retryable`/`discard`; konvergence ke calendar schématu je větší změna než tento batch unese.
- **P2-3** — retryable chyba blokuje calendar frontu za sebou.
- **P2-6** — update-ready UI pro service worker. Zadání nechalo na posouzení; je to samostatná UX změna bez jasné hodnoty v tomto batchi.
- **P2-5** — prázdné shimy `src/repositories/shopping/*`.

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb (warningy jsou preexistující) |
| `npm test` | ✅ 204 souborů, 1233 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| `npm run check:edge-functions` | ✅ |
| `git diff --check` | ✅ |
| `npx supabase start` / `db reset` / `npm run test:db` | ⚠️ **nespuštěno** — Docker není na tomto stroji dostupný. Batch neobsahuje žádné změny migrací ani RLS. |

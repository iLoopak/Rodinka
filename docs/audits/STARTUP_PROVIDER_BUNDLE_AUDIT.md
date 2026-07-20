# Rodinka — P0 audit startupu, provider graphu a bundle architektury

Datum auditu: 20. 7. 2026
Auditovaný commit: `558757f` (`main`, merge PR #101)
Rozsah: audit a doporučení. Implementační batch z briefu v tomto kroku nebyl proveden.

## Executive summary

Po úspěšném auth a membership bootstrapu se mountují všechny datové providery bez ohledu na aktivní route. To má tři zásadní důsledky:

1. **P0 — duplicitní startup data:** `CalendarOfflineProvider` po načtení lokálního snapshotu provede deset online dotazů nad tabulkami, které už ve stejném startupu načítají ostatní globální providery.
2. **P0 — jediný produkční chunk:** všechny top-level obrazovky jsou eager importované z `AppShell.tsx`. Build vytvořil jediný JS chunk **1 253 670 B / 344,36 kB gzip** a jediný CSS chunk **196 007 B / 45,63 kB gzip**. V produkčním `src` není žádný dynamický `import()`.
3. **P0 — široký startup fan-out:** při typickém online cold startu po přihlášení může před ustálením aplikace proběhnout přibližně **36 serverových operací**, plus podmíněné push/signed-URL operace. Současně se otevře **11 realtime channels**; deset tabulek je subscribováno duplicitně přes feature provider a calendar-offline channel.

Pozitivní je, že provider chain se při běžné změně route neremountuje, Shopping a Calendar mají offline-first repository lifecycle a část základních dat používá verzované IndexedDB cache. Hlavní problém je příliš mnoho globálně spuštěné práce a absence hranic v import graphu.

## Metodika a omezení

- Statická analýza sledovala skutečné call paths od `main.tsx` přes hooky/provider efekty až po `.from()`, `.rpc()`, storage a realtime volání.
- Produkční baseline byl změřen příkazem `npm run build` na Vite `8.1.4`; build prošel.
- Počty requestů jsou inventář možných startup call paths pro přihlášeného člena. Signed URL, token refresh a push registration závisejí na datech/prohlížeči.
- Audit neobsahuje HAR z živé přihlášené session. Časování a payloady je nutné v implementačním batchi potvrdit browser instrumentation.
- V repozitáři není bundle analyzer. „Největší moduly“ jsou proto doloženy velikostí zdrojů a import graphem, ne přesným podílem minifikovaného chunku.
- Brief požaduje before/after hodnoty. Tento audit-only krok obsahuje ověřený **before baseline**; „after“ čeká na implementaci.

## 1. Startup flow

```text
src/main.tsx
→ registrace service workeru po window.load
→ synchronní volba jazyka + neblokující i18next init
→ useSession auth bootstrap
→ useFamily membership bootstrap
→ RouterProvider + AppDataProviders + Reminder/Push/CreateRecord
→ OfflineStartupGate
→ AppShell
→ první route render
```

| Krok | Soubory | Async operace / timeout | Error stav | Blokuje první použitelný render? |
|---|---|---|---|---|
| Entry a CSS/fonty | `src/main.tsx:1-21` | žádná explicitní | chybějící `#root` je fatální | ano z pohledu download/parse vstupního chunku |
| Service worker | `src/push/registerServiceWorker.ts` | registrace až po `window.load` | pouze `console.error` | ne; správně odloženo |
| Jazyk | `src/i18n/index.ts`, `LanguageProvider.tsx` | jazyk z localStorage/browseru; `i18next.init()` se neawaituje; SW ready běží na pozadí | fallback `en` | prakticky ne |
| Auth session | `src/hooks/useSession.ts:7-54` | listener + `auth.getSession()`, timeout 10 s | timeout/rejection se mapuje na `session=null` | ano; do vyřešení `AppLoading` |
| Lokální family identity | `src/hooks/useFamily.ts:46-64` | IndexedDB `loadFamilyIdentity`, timeout 10 s | chyba se zaloguje | ano nepřímo; síťový membership začne až poté |
| Membership | `src/hooks/useFamily.ts:66-111` | `members` query dle `user_id`, timeout 10 s | network error může použít cache; datová chyba jde do error screen | ano; cache při zdravé síti neumožní optimistický render |
| Provider mount | `src/App.tsx:82-96`, `AppDataProviders.tsx` | efekty startují po authenticated commitu | vlastní loading/error | commit ne; Home čeká minimálně na chores a requesty soutěží o síť |
| Offline gate | `src/App.tsx:98-116` | čte Calendar snapshot a network status | offline fallback | ano pro blokované offline routes |
| Shell a route | `src/components/AppShell.tsx` | bez vlastní blokující promise | restricted/offline fallback | shell je progresivní; route může čekat na data |

### Kritická časová vlastnost bootstrapu

`useFamily.refresh()` awaituje lokální identity cache a teprve potom spustí membership request. Oba kroky mají samostatný 10s timeout. Spolu s auth timeoutem tak teoretická nejhorší cesta k rozhodnutí dosahuje přibližně **30 sekund**. Cache zrychlí pouze network-error fallback; při pomalé funkční síti neumožní dřívější použitelný render.

### První použitelný Home render

`useTodayDashboardData()` gateuje hlavní loading/error primárně přes chores, případně dovolí offline snapshot. Ostatní domény se doplňují progresivně. Síťovou prioritu však snižuje paralelní spuštění všech ostatních provider fetchů a Calendar snapshotu.

## 2. Přesný provider graph

```text
LanguageProvider
└─ App
   └─ RouterProvider
      └─ FamilyCoreProvider
         └─ FamilyMembersProvider
            └─ FamilySettingsProvider
               └─ ChoresProvider
                  └─ AllowanceProvider
                     └─ ActivitiesProvider
                        └─ OccurrenceAssignmentsProvider
                           └─ MedicalProvider
                              └─ MealsProvider
                                 └─ CalendarOfflineProvider
                                    └─ ShoppingProvider
                                       └─ MessagesProvider
                                          └─ ReminderProvider
                                             └─ PushProvider
                                                └─ CreateRecordProvider
                                                   └─ OfflineStartupGate
                                                      └─ AppShell
```

### Provider inventory

| Provider | Props / hooky | Mount read / cache | Realtime | Skuteční konzumenti | Potřeba pro Dnes |
|---|---|---|---|---|---|
| `FamilyCoreProvider` | `member`, `userId`, `userEmail`; `useMemo` | žádný | ne | celý shell, capabilities | ano |
| `FamilyMembersProvider` | `familyId`, `userId`; members/profiles hooky | query-cache IDB; `members`; bulk avatar signed URLs | `family-members` → `members` | header/logo, wizard, people pickery a většina routes | ano |
| `FamilySettingsProvider` | `familyId` | category IDB; query-cache IDB; `families`; hero signed URL | `family-settings` → `families` | header, Dnes hero, Shopping, Family, More, wizard | ano |
| `ChoresProvider` | `familyId`, `userId`, `currentMemberId` | `chores`, `chore_completions` | `chores` → obě tabulky | Dnes, Calendar, Planner, Chores, Family, wizard, Messages, reminders | ano |
| `AllowanceProvider` | `familyId` | `allowance_ledger`, `allowance_plans`, `allowance_cycles` | `allowance` → ledger | Dnes attention, Chores, Family allowance | ano |
| `ActivitiesProvider` | `familyId` | `activities` + participants | `activities` → activities + participants | Dnes, Planner, Activities, Family, wizard, Messages, reminders | ano |
| `OccurrenceAssignmentsProvider` | `familyId` | 3 override/history tabulky | `occurrence-assignments` → stejné 3 tabulky | Dnes, Calendar, Chores, reminders | ano |
| `MedicalProvider` | `familyId`, `userId` | `medical_records` | `medical` → `medical_records` | Dnes, Planner, Health, Calendar, wizard, reminders | ano |
| `MealsProvider` | `familyId`, `userId`; 3 hooky | `meals`, nested vote rounds, `meal_plan_entries` | `meals` → 5 tabulek | Dnes potřebuje votes/plan; Meals a wizard také library | částečně |
| `CalendarOfflineProvider` | `familyId`, `userId`, `currentMemberId`; repository | IDB snapshot + mutations; potom 10 Supabase reads | `calendar-offline` → 11 tabulek | offline gate, Dnes fallback/status, Calendar, wizard, More clear | ano, ale online refresh nemusí předcházet first paint |
| `ShoppingProvider` | `familyId`, `currentMemberId`; repository | 3 IDB reads; `shopping_items`; `meal_ingredients` | `shopping` → `shopping_items` | Dnes, Shopping, Planner, Meals, wizard, Messages, reminders | ano; ingredients ne |
| `MessagesProvider` | `familyId`, `currentMemberId` | group RPC; `conversations`; `conversation_members` | `messages` → 6 tabulek | header bell, push bridge, Messages/share UI | ne; globálně stačí summary |
| `ReminderProvider` | čte 7 feature contexts | `reminders`, `notification_preferences`; sync RPC + refresh | ne; interval/visibility/storage | header bell, Center, Message push prompt | nepřímo globální |
| `PushProvider` | čte `familyId` | SW reconcile; vždy `push_subscriptions`; optional register RPC | ne | Reminder Center a Message push prompt | ne |
| `CreateRecordProvider` | `children` | žádný backend read | ne | globální wizard controller | controller ano; tělo ne |

### Remount lifecycle

- Běžný přechod mezi routes mění pouze `RouterContext`; provider graph zůstává mounted.
- Graph se remountne při reloadu, změně auth/family scope nebo opuštění authenticated state.
- V development `StrictMode` provede effect mount/cleanup/remount. Generic realtime helper nečeká na dokončení `removeChannel`, takže může krátce překrýt stejně pojmenované channels.
- Shopping a Calendar serializují stejný channel topic přes `channelTeardowns`; ostatní providery tuto ochranu nemají.

## 3. Startup request inventory

### První online start bez čerstvé cache

| Fáze | Operace |
|---|---|
| Auth | `auth.getSession()`; obvykle lokální, může vyvolat token refresh |
| Membership | IDB identity read → `members` query pro aktivního `user_id` |
| Members/settings | query-cache IDB → `members` + optional avatars; category IDB → `families` + optional hero URL |
| Chores/allowance | `chores`, `chore_completions`, `allowance_ledger`, `allowance_plans`, `allowance_cycles` |
| Activities/occurrence/medical | `activities`, 3 occurrence/history tabulky, `medical_records` |
| Meals | `meals`, nested `meal_vote_rounds`, `meal_plan_entries` |
| Calendar offline | IDB snapshot + mutation queue → 10 paralelních reads |
| Shopping | IDB items/mutations/metadata → `shopping_items`; paralelně `meal_ingredients` |
| Messages | group RPC → `conversations` + `conversation_members` |
| Reminders | `reminders` + preferences; poté sync RPC a nový read reminders |
| Push | reconcile; vždy `push_subscriptions`; při existující subscription register RPC |

**Call-graph odhad:** minimálně přibližně 36 serverových operací do ustálení. Chybějící preferences přidají upsert, existující push subscription register RPC a avatary/hero až dvě storage operace.

### Opakovaný online start s cache

- Membership request se provede vždy; identity cache nevede k optimistickému renderu.
- Čerstvá query cache může eliminovat `members` a `families` read včetně signed URLs.
- Calendar a Shopping vždy po lokálním snapshotu provedou online sync.
- Ostatní providery nemají startup cache short-circuit.
- Typická úspora čerstvé cache je tedy přibližně 2 serverové reads.

### Otevření Home

- Home po provider mountu nespouští vlastní nový fetch; čte už běžící contexts.
- Ruční refresh Home znovu spouští chores, completions, activities, occurrence, medical, meals, allowance, Shopping sync a celý Calendar snapshot.

### Otevření feature route

- Calendar/Planner/Chores/Activities/Health/Meals/Shopping nepřidají initial provider fetch, protože providery už běží.
- `FamilyScreen` načítá `child_accounts` a RPC `family_member_emails`. Interní mount refresh hooku a screen effect mohou při prvním mountu vytvořit duplicate child-account read.
- `MoreScreen` spouští `auth.getUser()` a vlastní auth listener.
- `MessagesScreen` načte messages zvolené conversation on demand, poté reactions/attachments/entities a signed URLs podle obsahu.
- `FamilyJumpScreen` čte lokální records/progress a při syncu `family_game_scores`; po výsledku může volat score RPC.

### Návrat z feature route na Home

- Provider graph zůstává mounted, mount fetch se neopakuje.
- Route-local hooky se unmountnou.
- Calendar/Shopping sync reaguje na browser visibility/online, ne na samotnou route změnu.

### Offline start

- Shopping a Calendar publikují IDB snapshot a online sync přeskočí.
- Ostatní eager providery se stále mountují a přímé Supabase reads se pokusí failnout; jen members/settings mají persistent stale-cache fallback.
- `OfflineStartupGate` rozhoduje až uvnitř už mounted graphu a nezabrání těmto pokusům.

## 4. Realtime inventory

| Channel | Tabulky / filtry | Aktivní mimo feature? | Duplicita |
|---|---|---|---|
| `family:<id>:family-members` | members, family filter | ano | members také calendar-offline |
| `family:<id>:family-settings` | families, id filter | ano; header ji používá | ne |
| `family:<id>:chores` | chores filtered; completions jen RLS | ano | obě také calendar-offline |
| `family:<id>:allowance` | ledger, family filter | ano | ne |
| `family:<id>:activities` | activities filtered; participants jen RLS | ano | obě také calendar-offline |
| `family:<id>:occurrence-assignments` | 3 filtered tabulky | ano | všechny také calendar-offline |
| `family:<id>:medical` | medical records filtered | ano | také calendar-offline |
| `family:<id>:meals` | 3 filtered + candidates/votes jen RLS | ano | plan entries také calendar-offline |
| `family:<id>:messages` | conversations, members, messages, reactions, attachments, refs | ano; globálně stačí subset | ne |
| `family:<id>:shopping` | shopping items wildcard, filtered | ano | ne |
| `family:<id>:calendar-offline` | 9 filtered + completions/participants jen RLS | ano | duplikuje 10 tabulek |

### Duplicate subscription závěr

- Route navigace sama nové channels nevytváří.
- Calendar-offline však souběžně duplikuje `members`, `chores`, `chore_completions`, `activities`, `activity_participants`, `medical_records`, `meal_plan_entries`, `occurrence_overrides`, `series_assignment_history` a `activity_participant_history`.
- Generic `createRealtimeSubscription()` nemá registry ani diagnostiku active names/count/reason a teardown je fire-and-forget.
- Shopping/Calendar chrání remount; ostatní channels se mohou v dev StrictMode/HMR krátce překrýt.
- DEV log neplní brief: neukazuje důvod otevření/uzavření, active count ani duplicate warning.

## 5. Rerender a context fan-out

### Co je stabilní

- `FamilyCoreProvider` a `LanguageProvider` memoizují malé values.
- `CreateRecordProvider` memoizuje controller.
- Oddělené feature contexts izolují unrelated consumers; kryje to `AppDataProviders.isolation.test.ts`.

### Široké nebo nestabilní contexts

Většina feature providerů skládá nový value objekt bez `useMemo`: FamilyMembers, FamilySettings, Chores, Allowance, Activities, Occurrence, Medical, Meals, Calendar, Shopping, Messages, Reminder a Push. Změna jediné položky notifikuje všechny consumers daného contextu.

1. **`AppShell`** čte celý Messages context kvůli `activeConversationId`, celý Shopping/Calendar kvůli jednomu statusu a devět contexts přes `useRealtimeStatus()`. Item update tak může rerenderovat shell/header i aktivní route subtree.
2. **`ReminderProvider`** čte sedm plných domén přes `useReminderSources()`. Změna zdroje přepočítá drafts a může spustit sync RPC + reminders read.
3. **`CreateRecordWizard`** je mounted na každé shell route a subscribuje k osmi doménám, i když je dialog zavřený.
4. **`MessagesContext`** kombinuje metadata, messages, reactions, attachments, signed URLs, entities a akce. Header bell sdílí široký context s plným chatem.
5. **`RouterProvider`** posílá inline value; není granularita path vs search.

Příklad: insert message změní Messages value a rerenderuje `MessagesBell`, `AppShell` a další consumers, i když je uživatel na Home. Medical update zase rerenderuje ReminderProvider a AppShell přes `useRealtimeStatus`, i když status zůstane `connected`.

### Doporučené hranice

- Oddělit status contexts od data contexts nebo použít selector-friendly external store.
- Messages rozdělit na globální summary a route content.
- Nemountovat tělo `CreateRecordWizard`, dokud není otevřené; ponechat globální controller.
- U Meals oddělit plan/vote summary od plné library.
- U Shopping odložit `meal_ingredients`.

## 6. Bundle audit

### Naměřený baseline

Příkaz: `npm run build`
Výsledek: build úspěšný, 2 124 transformovaných modulů.

| Artefakt | Raw | Gzip |
|---|---:|---:|
| JS `index-B3DyLbYx.js` | 1 253 670 B | 344,36 kB |
| CSS `index-C_9BBPLD.css` | 196 007 B | 45,63 kB |
| font assets | 40 souborů / 367 796 B | unicode-range znamená, že browser nestahuje nutně všechny |

Vite varuje před chunkem nad 500 kB. `vite.config.ts` obsahuje pouze `react()`; nemá analyzer, chunk policy ani guard.

### Route splitting stav

- `AppShell.tsx` staticky importuje Today, Calendar, Planner, Chores, Activities, Health, Meals, Shopping, Family, Messages, More, Reminder Center a Family Jump.
- V produkčním source graphu není dynamický `import()`; nalezené jsou jen v testech.
- Family Jump není samostatný chunk a přináší screen, engine, core, environments, cosmetics a CSS do main.
- Messages: `MessagesScreen.tsx` 56 124 B, `useMessagesDataSource.ts` 51 483 B, `Composer.tsx` 18 986 B, `EntityCard.tsx` 15 458 B před shared dependencies.
- Family Jump: engine 27 621 B, screen 25 911 B, CSS 18 210 B, core 13 573 B.
- Další velké eager screens: Shopping 28 569 B, Reminder Center 22 640 B, Family 20 239 B, More 18 180 B, Calendar 17 538 B, Activities 11 832 B, Chores 11 561 B.
- `src/index.css` má 213 505 B zdrojově a `src/strings.ts` 160 175 B; obojí je globální.

### Dopad feature oblastí

| Feature | Důkaz | Dopad |
|---|---|---|
| Family Jump | static import + vlastní 18 kB CSS | engine se parsuje na každém startupu |
| Messages | static route + globální provider + bell | velký UI/data source v main; část provideru je globální |
| Meals | static screen, provider, wizard, reminders | UI lze splitnout; planning summary zůstává |
| Calendar | static screen + offline repository | UI lze splitnout; repository je potřebná pro offline Home |
| Health/Activities/Family/More | statické screens | route UI lze bezpečně splitnout |
| Reminder Center | static screen, globální provider kvůli bell | Center UI lze splitnout |

### Before / after

| Metrika | Before (`558757f`) | After |
|---|---:|---:|
| main JS raw | 1 253 670 B | čeká na implementaci |
| main JS gzip | 344,36 kB | čeká na implementaci |
| main CSS raw | 196 007 B | čeká na implementaci |
| produkční JS route chunks | 0 | čeká na implementaci |
| Family Jump samostatný chunk | ne | acceptance target: ano |

### Bundle tooling a guard návrh

1. Přidat development-only `rollup-plugin-visualizer` a skript `build:analyze`.
2. Přidat `scripts/check-route-chunks.mjs`, který čte Vite manifest a ověří:
   - Family Jump, Messages a Meals mají vlastní dynamic chunk,
   - jejich module IDs nejsou v entry chunku,
   - main gzip budget má toleranci, např. baseline + 10 %.
3. Standardní build generovat s manifestem, aby guard byl reprodukovatelný bez runtime dependency.

## 7. Prioritizované nálezy

### P0-1 — Calendar snapshot duplikuje deset startup reads a subscriptions

- **Soubory:** `CalendarOfflineContext.tsx`, `calendarRepository.ts`, `calendarSync.ts`, `calendarRealtime.ts`, `AppDataProviders.tsx`.
- **Příčina:** offline repository online vždy obnoví 10-query snapshot, zatímco stejné domény načítají feature providers.
- **Dopad:** síťová konkurence před useful Home, dvojí normalizace/paměť, 10 duplicitních subscriptions.
- **Oprava:** okamžitě načíst lokální snapshot, online refresh odložit po first-interactive/idle; následně sjednotit snapshot refresh nad sdílenými výsledky nebo snapshot-writer API. Offline repository zachovat.
- **Riziko:** střední až vysoké.
- **Ověření:** HAR/request counter cold/warm/offline, repository lifecycle, Home offline snapshot, active channels.

### P0-2 — všechny routes a Family Jump jsou v jediném eager chunku

- **Soubory:** `AppShell.tsx`, `router.tsx`, `vite.config.ts`.
- **Příčina:** statické importy a dlouhá série `path ===`.
- **Dopad:** 1,25 MB raw JS pro každý startup.
- **Oprava:** route registry + `React.lazy`/`Suspense`; minimálně Family Jump, Messages, Meals, Health, Activities, Family, More, Reminder Center; dle analyzeru Calendar/Planner/Chores.
- **Riziko:** nízké až střední; fullscreen, offline, capability a direct refresh.
- **Ověření:** registry/lazy tests, manifest guard, direct refresh, push deep link.

### P0-3 — cache nezrychluje auth/family rozhodnutí

- **Soubory:** `useSession.ts`, `useFamily.ts`, `authRoutingState.ts`.
- **Příčina:** identity cache se awaituje před membership, ale zdravá síť ji nepoužije pro dřívější render.
- **Dopad:** přidaná latency; teoretický chain 10 + 10 + 10 s; auth timeout vypadá jako odhlášení.
- **Oprava:** cache a membership paralelně; explicitní scoped `cached-validating` stav; auth timeout jako retryable error.
- **Riziko:** střední kvůli user switch a managed child.
- **Ověření:** fake timers, user isolation, slow-network cached boot, child routing.

### P0-4 — cold start spouští přibližně 36 serverových operací

- **Soubory:** celý provider graph, ReminderContext, PushContext.
- **Příčina:** mount fetch každé domény; minimum cache; Reminder ihned zapisuje a znovu čte.
- **Dopad:** mobilní startup, egress/request pressure, konkurence error stavů.
- **Oprava:** startup reason instrumentation; Home minimum; background offline refresh; odložit ingredients, message content a push device list.
- **Riziko:** střední.
- **Ověření:** request inventory mock + browser trace a Home parity.

### P1-1 — AppShell a ReminderProvider jsou fan-out uzly

- **Soubory:** `AppShell.tsx`, `useRealtimeStatus.ts`, `useReminderSources.ts`, `ReminderContext.tsx`.
- **Příčina:** context nemá selector; čtení statusu subscribuje k celému value.
- **Dopad:** item update může rerenderovat shell a reminder generation.
- **Oprava:** malé summary/status contexts, memo values nebo `useSyncExternalStore` status registry.
- **Riziko:** střední.
- **Ověření:** render-count tests při item update bez status změny.

### P1-2 — Messages míchá globální metadata a route obsah

- **Soubory:** `useMessagesDataSource.ts`, `MessagesContext.tsx`, `MessagesBell.tsx`, `AppShell.tsx`.
- **Příčina:** jeden context pro unread i messages/extras/actions.
- **Dopad:** content update propaguje do headeru/shellu; 6-table realtime je aktivní všude.
- **Oprava:** globální summary lifecycle a route content lifecycle, vždy jediný vlastník subscription.
- **Riziko:** střední až vysoké kvůli push suppression a optimistic merge.
- **Ověření:** deep-link/unread/no-duplicate/optimistic tests.

### P1-3 — CreateRecordWizard subscribuje k osmi doménám i zavřený

- **Soubory:** `CreateRecordWizard.tsx`, `CreateRecordContext.tsx`, `AppShell.tsx`.
- **Příčina:** celé tělo wizardu je vždy mounted.
- **Dopad:** rerender fan-out a eager import formulářů.
- **Oprava:** controller globálně, wizard body renderovat/lazy-loadnout jen při open.
- **Riziko:** nízké.
- **Ověření:** open/close/history/dirty tests.

### P1-4 — realtime helper nemá lifecycle diagnostiku ani duplicate guard

- **Soubor:** `createRealtimeSubscription.ts`.
- **Příčina:** jen console debug; žádná registry/count/reason; teardown není serializovaný.
- **Dopad:** obtížná diagnostika a možné dev/HMR překryvy.
- **Oprava:** DEV-only registry `{channelName, owner, tables, openedAt}`, warning count > 1 a close reason; bez payloadů; production dead-code elimination.
- **Riziko:** nízké.
- **Ověření:** mount/remount/duplicate unit tests a production string check.

### P1-5 — PushProvider eager načítá device management data

- **Soubory:** `PushContext.tsx`, `pushClient.ts`.
- **Příčina:** refresh vždy načte celý `push_subscriptions` list.
- **Dopad:** request na každém startupu, seznam zařízení používá hlavně Reminder Center.
- **Oprava:** lehký current-device stav vs route-specific device list.
- **Riziko:** nízké až střední.
- **Ověření:** push prompt, device center, SW subscription change.

### P1-6 — Family route může dvakrát načíst child accounts

- **Soubory:** `useChildAccounts.ts`, `FamilyScreen.tsx:63-81`.
- **Příčina:** interní mount effect i screen signature effect volají refresh.
- **Dopad:** duplicate route-local request.
- **Oprava:** jeden vlastník refresh triggeru.
- **Riziko:** nízké.
- **Ověření:** call-count při mountu a membership změně.

### P2-1 — 40 font assets a globální CSS monolit

- **Soubory:** `main.tsx`, `index.css`, Manrope imports.
- **Příčina:** čtyři weights se všemi subset CSS a eager feature CSS.
- **Dopad:** build footprint; browser díky unicode-range typicky nestahuje vše.
- **Oprava:** explicitní latin/latin-ext subsety; route CSS nechat následovat lazy chunk.
- **Riziko:** nízké.
- **Ověření:** české glyphy, build diff, font waterfall.

## 8. Minimální datový základ

### Auth + family bootstrap

Nutné: auth session, aktivní membership pro aktuální `user_id`, `familyId`, `memberId`, role/capabilities a při offline fallbacku ověřená cached identity stejného userId. Ostatní members, hero, feature data, messages, reminders a push devices nemusí předcházet authenticated shell commitu.

### AppShell minimum

- current member/capabilities,
- family name/logo members progresivně,
- malé realtime/sync summary,
- unread message/reminder counts,
- router + create-record controller,
- service-worker deep-link bridge.

Shell nepotřebuje plné messages, reactions, meal library, medical list, activities list ani device list.

### Home minimum

Pro první skutečně užitečný obsah: current member + members, chores + completions, lokální Shopping summary a lokální Calendar snapshot jako offline fallback. Activities, occurrence, medical reminders, meal plan/vote, allowance a hero lze doplňovat progresivně. Plná meals library, message content, ingredients, child-account admin, auth detail a Family Jump engine nejsou Home startup data.

## 9. Doporučený první bezpečný implementační batch

1. **Route registry + lazy boundaries:** nový malý registry modul s path, lazy loader, offline/capability policy, fullscreen a fallback; Home eager; lazy minimálně Family Jump, Messages, Meals, Health, Activities, Family, More a Reminder Center; jednotný Suspense fallback.
2. **Nízkorizikové odložení 1–2 oblastí:** `meal_ingredients` až při otevření příslušného Meals UI; push device list až v device-management UI. Calendar provider nepřesouvat, jen odložit online full sync za first-interactive a instrumentovat reason.
3. **DEV realtime diagnostics:** active channels, owner/reason/open/close/count a duplicate warning bez payloadů.
4. **Bundle report + guard:** analyzer, manifest, Family Jump/Messages/Meals mimo main a tolerantní gzip budget.

Nedoporučuji v prvním batchi plošně přesunout všechny Home providery na route level. Home, reminders, wizard, offline snapshot a entity sharing data skutečně sdílejí; plošný přesun by vytvořil duplicate fetch/subscription nebo ztrátu lokálního stavu.

## 10. Test coverage a acceptance gap

### Existující relevantní krytí

- auth routing/offline fallback: `App.authRouting.test.tsx`, `authRoutingState.test.ts`;
- provider isolation: `AppDataProviders.isolation.test.ts`;
- dílčí realtime provider/helper tests;
- push/security, message optimistic merge;
- Calendar/Shopping repository lifecycle a offline tests.

### Chybějící testy pro brief

- route registry metadata/fallback,
- lazy Suspense render,
- fullscreen Family Jump přes registry,
- capability/offline policy jako data,
- direct refresh všech routes,
- push deep link po lazy Messages,
- active-channel registry a duplicate remount,
- Home parity po lifecycle změně,
- manifest/bundle guard.

### Ověření implementačního batchu

```bash
npm run lint
npm test
npm run build
npm run check:edge-functions
git diff --check
```

`npm run test:db` spustit jen s dostupným lokálním Supabase stackem/env. Doplnit cold/warm/offline browser trace a before/after manifest report.

## 11. Acceptance criteria — aktuální stav

| Kritérium | Stav na `558757f` |
|---|---|
| provider/request/subscription mapa | splněno tímto auditem |
| velké routes mimo main | nesplněno |
| Family Jump lazy chunk | nesplněno |
| AppShell bez dlouhé route série | nesplněno |
| žádné duplicate realtime subscriptions | nesplněno na úrovni tabulek; route navigace sama nové channels nevytváří |
| Home/offline/child/push/wizard parity | baseline funguje; regresně ověřit po změně |
| before/after bundle | before zdokumentován; after čeká |
| čitelné moduly bez monolitu | doporučená registry/summary architektura to umožňuje |

## Závěr

Nejvyšší okamžitou návratnost má route-level code splitting: je relativně izolované od datového lifecycle a odstraní Family Jump, Messages a další velké screens z každého startupu. Největší datový problém je duplicitní Calendar snapshot. Jeho oprava musí zachovat IndexedDB snapshot, mutation queue a offline Home, ale online full refresh nemá soutěžit s deseti stejnými provider reads před prvním použitelným renderem.

Provider graph není vhodné plošně roztrhat podle routes. Bezpečný směr je oddělit malé globální summaries/controllers od těžkých route obsahů, přidat lifecycle diagnostiku a postupovat po 1–2 doménách s měřitelným before/after výsledkem.

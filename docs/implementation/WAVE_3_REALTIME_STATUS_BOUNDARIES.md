# Wave 3 — realtime lifecycle diagnostika a úzké status hranice

## Shrnutí

Wave 3 přidává development-only registry realtime lifecycle, bezpečný idempotentní teardown a selector-friendly globální status. `AppShell` už nečte plné Shopping, Calendar a Messages contexty ani devět feature contextů přes původní `useRealtimeStatus()`.

Datové vlastnictví, počet Calendar subscriptions, Messages metadata/content lifecycle, auth bootstrap, offline queues a databázové schema zůstávají beze změny.

## Realtime channels před a po

Počet i vlastnictví channelů zůstává **11 → 11**. Wave 3 mění jejich pozorovatelnost, nikoli jejich funkční rozdělení.

| Channel | Owner v registry | Tabulky | Před | Po |
|---|---|---|---:|---:|
| `family:<id>:family-members` | `FamilyMembersProvider` | `members` | 1 | 1 |
| `family:<id>:family-settings` | `FamilySettingsProvider` | `families` | 1 | 1 |
| `family:<id>:chores` | `ChoresProvider` | `chores`, `chore_completions` | 1 | 1 |
| `family:<id>:allowance` | `AllowanceProvider` | `allowance_ledger` | 1 | 1 |
| `family:<id>:activities` | `ActivitiesProvider` | `activities`, `activity_participants` | 1 | 1 |
| `family:<id>:occurrence-assignments` | `OccurrenceAssignmentsProvider` | `occurrence_overrides`, `series_assignment_history`, `activity_participant_history` | 1 | 1 |
| `family:<id>:medical` | `MedicalProvider` | `medical_records` | 1 | 1 |
| `family:<id>:meals` | `MealsProvider` | meals doména | 1 | 1 |
| `family:<id>:messages` | `MessagesProvider` | messages doména | 1 | 1 |
| `family:<id>:shopping` | `ShoppingRepository` | `shopping_items` | 1 | 1 |
| `family:<id>:calendar-offline` | `CalendarRepository` | stávajících 11 Calendar listenerů | 1 | 1 |

Registry pro každou instanci eviduje `channelName`, stabilní `owner`, seznam tabulek, `openedAt`, `openReason` a `instanceId`. Při close přidává důvod, délku lifecycle a informaci, zda stejný channel stále drží jiná instance. Payloady ani query filtry neukládá.

## Teardown a duplicate lifecycle

- cleanup generic subscription je idempotentní;
- druhý cleanup nevolá `removeChannel` a nevyhazuje chybu;
- synchronní i asynchronní selhání removal se bezpečně zachytí;
- mount → cleanup → StrictMode remount nezanechá duplicate instanci;
- skutečný překryv stejného `channelName` vyvolá pouze development warning a neblokuje runtime;
- rozdílné channels zůstávají paralelní;
- stávající serializace teardownu Calendar/Shopping zůstala zachována.

## Úzké status hranice

### Před

`AppShell` získával globální realtime status čtením devíti celých feature contextů. Dále přímo četl plný Shopping context kvůli `shoppingSyncStatus`, plný Calendar context kvůli `calendarSyncStatus` a plný Messages context kvůli `activeConversationId`.

### Po

- realtime: externí `RealtimeSummary` store a primitive selector `useRealtimeOverallStatus()`;
- shopping: `useShoppingSyncStatus()`;
- calendar: `useCalendarSyncStatus()`;
- conversation bridge: `useActiveConversationId()`.

Snapshot neobsahuje feature data. Plná Messages data zůstávají v původním contextu; Wave 3 pouze přidala úzký bridge pro aktivní konverzaci.

## Render-count before/after

Hodnoty jsou počet dodatečných renderů status/header consumeru po jedné změně, mimo samotný inicializační render.

| Scénář | Před | Po | Důkaz |
|---|---:|---:|---|
| Shopping item update, sync status beze změny | 1 | 0 | specializovaný provider/render test |
| Medical item update, realtime status beze změny | 1 | 0 | shell/status import contract: Medical context už není dependency |
| Opakované nastavení stejného realtime statusu | závislé na širokém provider value | 0 | external-store primitive snapshot test |
| Skutečná změna `connected`/`reconnecting` | 1 | 1 | status render test + zachovaný badge/logo contract |

Změna `activeChannelCount`, která nezmění `overall`, také neinvaliduje `AppShell`: shell používá primitive selector, nikoli celý summary objekt.

## Browser QA

Lokální aplikace byla ověřena na čistém development portu. Načtení skončilo na korektní přihlašovací obrazovce; tato browser relace neměla přihlášený family session, takže neotevřela family realtime channels.

- zachycené `[Rodinka realtime]` duplicate warningy: **0**;
- omezení: výsledek platí pro neautentizovaný startup, nikoli pro přihlášený family lifecycle;
- authenticated duplicate lifecycle pokrývají deterministické testy registry: souběžná instance, owner mapping, close mapping a StrictMode-like remount.

## Produkční kontrakt

- registry historie a warningy jsou pod `import.meta.env.DEV`;
- produkční bundle guard prohledává všechny JS chunky a selže při výskytu `[Rodinka realtime]`;
- registry neloguje realtime payloady;
- build po změně: main **346 675 B raw / 102 697 B gzip**, eager graph **765 692 B raw / 224 624 B gzip**.

## Připravené follow-up body

### Wave 4 — Calendar

- použít registry baseline pro měření překryvu `calendar-offline` s feature channels;
- při deduplikaci zachovat stabilní owner/reason a ověřit active count;
- přesunout online refresh bez změny lokálního snapshot authority;
- porovnat duplicate table listeners před/po, nikoli pouze počet channelů.

### Wave 5 — Messages

- postavit metadata/unread summary na nové úzké hranici;
- ponechat `activeConversationId` bridge samostatný;
- načítat těžký message content podle route/aktivní konverzace;
- registry použít k ověření, že split nevytvořil paralelní source of truth nebo duplicate channel.

## Automatizovaná validace

- registry add/remove, duration, reason a owner mapping;
- duplicate warning a aktivní count;
- idempotentní cleanup a removal failure;
- StrictMode-like mount/cleanup/remount;
- shopping item update bez status renderu;
- skutečná realtime/sync změna s renderem;
- statický AppShell boundary a zachovaný conversation push bridge;
- production diagnostics bundle guard.

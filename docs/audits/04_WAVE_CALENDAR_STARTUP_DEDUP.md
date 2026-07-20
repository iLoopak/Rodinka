# Rodinka — Wave 4: Calendar startup deduplikace a odložený online refresh

Navazuj na dokončenou realtime diagnostiku z Wave 3.

Cílem je odstranit největší datový P0 problém z auditu: Calendar offline repository při online startupu znovu načítá a subscribuje tabulky, které již načítají a sledují feature providery.

Zachovej offline snapshot, mutation queue, idempotent sync a offline Home.

## Hlavní problém

Calendar offline vrstva dnes při startupu:

- načte IndexedDB snapshot,
- následně spustí přibližně 10 Supabase reads,
- otevře vlastní channel nad přibližně 11 tabulkami,
- duplikuje reads a subscriptions ostatních feature providerů.

Tato vrstva je potřebná pro offline Calendar a Home, ale online full refresh nemá soutěžit o síť před first-useful renderem.

## Cíle

1. Publikovat lokální Calendar snapshot okamžitě.
2. Odložit online full snapshot refresh mimo kritický first-render path.
3. Odstranit duplicate startup reads, kde lze bezpečně reuse existující feature data.
4. Omezit duplicate realtime subscriptions.
5. Zachovat durable queue a reconnect sync.
6. Měřit before/after request a channel count.

## Povinná audit-before-change fáze

Před implementací vytvoř přesnou ownership tabulku pro Calendar snapshot entity:

- members,
- chores,
- chore completions,
- activities,
- activity participants,
- medical records,
- meal plan entries,
- occurrence overrides,
- series assignment history,
- participant history.

U každé určete:

- který provider ji už načítá,
- zda provider drží úplný dataset potřebný pro snapshot,
- zda data obsahují pending lokální změny,
- zda lze snapshot aktualizovat z provider state,
- zda je nutný samostatný Calendar fetch.

Výsledek vlož do implementation reportu.

## Implementační strategie

Preferuj postup ve dvou vrstvách.

### A. Immediate local snapshot

Při mountu:

1. načti IndexedDB snapshot,
2. publikuj usable data a sync metadata,
3. nezablokuj Home,
4. nepouštěj full online refresh synchronně v kritickém path.

### B. Deferred online reconciliation

Online reconciliation spusť:

- po first interactive,
- přes `requestIdleCallback` s fallbackem,
- nebo po explicitním scheduler signálu po dokončení core startupu.

Musí existovat timeout fallback, aby se sync nespustil až nikdy.

Při změně route na Calendar může být refresh povýšen na vyšší prioritu.

### C. Snapshot writer / reuse provider data

Kde feature provider drží správný úplný dataset, zaveď explicitní snapshot-writer API nebo mapper:

```ts
calendarSnapshotWriter.updateDomain('chores', data)
```

Přesný návrh přizpůsob architektuře.

Podmínky:

- feature provider není závislý na Calendar React contextu,
- nevytvářej cyklické context imports,
- repository/persistence detail zůstane mimo UI component,
- pending offline mutation nesmí být přepsána starším online provider state,
- snapshot update musí být scope-safe.

Pokud reuse u konkrétní entity není bezpečný, ponech její samostatný fetch a zdokumentuj proč.

### D. Realtime ownership

Na základě Wave 3 registry určete jediného vlastníka pro každou realtime tabulku.

Preferované varianty:

1. feature provider vlastní subscription a předává mapped update snapshot writeru,
2. shared domain repository vlastní subscription a publikuje oběma consumerům,
3. Calendar drží subscription pouze pro data, která nemají jiného vlastníka.

Nesmí zůstat dva aktivní subscriptions na stejnou tabulku jen kvůli synchronizaci snapshotu, pokud pro to není doložený důvod.

### E. Sync queue

Neměň durable mutation semantics.

Ověř:

- offline create,
- reload s pending queue,
- reconnect,
- duplicate online events,
- manual retry,
- auth expiry,
- family/member scope změnu,
- server idempotency.

Deferred refresh nesmí způsobit dvojí server mutation.

## Testy

Doplň testy pro:

1. local snapshot se zobrazí před online reconciliation,
2. Home není blokovaný full Calendar syncem,
3. online reconciliation se spustí deferred,
4. otevření Calendar může refresh urychlit,
5. stejná tabulka nemá duplicate active subscriptions,
6. provider update se propíše do snapshotu,
7. pending offline item není přepsán staršími server daty,
8. reload + reconnect synchronizuje právě jednou,
9. manual retry během auto sync nevytvoří duplicitu,
10. user/family switch izoluje snapshot,
11. offline start bez sítě neprovádí zbytečné online fetch pokusy,
12. degraded backend stav zachová usable snapshot.

## Měření

Zapiš before/after pro:

- cold startup Supabase operations,
- Calendar-specific startup reads,
- active realtime channel count,
- duplicate table subscriptions,
- time do usable Home renderu,
- čas do dokončení background Calendar reconciliation.

## Dokumentace

Vytvoř:

```text
docs/implementation/WAVE_4_CALENDAR_STARTUP_DEDUP.md
```

## Co neměnit

- UI Calendar obrazovky mimo loading/sync indikaci,
- Shopping repository,
- Messages architecture,
- auth/family bootstrap,
- databázové schema bez jasné nutnosti,
- recurrence business logic.

## Acceptance criteria

- Offline Calendar snapshot a queue zůstávají funkční.
- Full Calendar online refresh nesoutěží s core startupem před first-useful renderem.
- Calendar již neduplikuje deset startup reads.
- Duplicate table subscriptions jsou odstraněny nebo explicitně zdůvodněny.
- Home offline fallback a Calendar direct refresh zůstávají funkční.
- Request/channel before/after je zdokumentovaný.

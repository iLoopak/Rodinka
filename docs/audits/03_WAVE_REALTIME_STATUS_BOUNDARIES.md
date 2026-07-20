# Rodinka — Wave 3: realtime lifecycle diagnostika a úzké status contexts

Navazuj na Wave 1 a Wave 2.

Cílem je vytvořit bezpečné měření realtime lifecycle a odstranit z `AppShell` zbytečné subscriptions k celým feature contextům jen kvůli jejich statusu.

Tato vlna ještě nemá deduplikovat Calendar subscriptions ani rozdělovat Messages data/content lifecycle. Má připravit měřitelné a testovatelné hranice pro další vlny.

## Cíle

1. Přidat development-only realtime registry.
2. Detekovat duplicate channel lifecycle.
3. Rozlišit channel owner, reason open a reason close.
4. Vytvořit úzký globální realtime status snapshot.
5. Přestat v `AppShell` číst celé feature contexts pouze kvůli statusům.
6. Omezit zbytečný rerender shellu při item updates.

## Implementace

### A. Realtime registry

Rozšiř shared realtime helper nebo přidej samostatný infrastructure modul, například:

```text
src/realtime/realtimeRegistry.ts
```

Registry musí development-only sledovat:

```ts
interface ActiveRealtimeSubscription {
  channelName: string
  owner: string
  tables: string[]
  openedAt: number
  openReason: string
  instanceId: string
}
```

Při close eviduj:

- close reason,
- lifecycle duration,
- zda channel name stále drží jiná instance.

Při více aktivních instancích stejného `channelName`:

- zobraz development warning,
- neloguj payloady,
- neblokuj runtime,
- umožni testovat count.

Production build nesmí obsahovat verbose diagnostické logy.

### B. Teardown behavior

Prověř generic `createRealtimeSubscription()`.

Zajisti, aby:

- cleanup byl idempotentní,
- double cleanup nevyhazoval chybu,
- StrictMode/HMR nevytvářel neřízený překryv,
- removal failure byl bezpečně zachycen,
- owner/reason byly povinné nebo jednoznačně defaultované.

Nevytvářej globální serializaci, která by rozbila paralelní rozdílné channels.

### C. Realtime status store

Vytvoř malé selector-friendly rozhraní pro globální status.

Příklad:

```ts
interface RealtimeSummary {
  overall: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  disconnectedOwners: string[]
  activeChannelCount: number
}
```

Použij:

- malý context s memoizovanou value,
- nebo `useSyncExternalStore`,
- nebo jiný jednoduchý selector-friendly mechanismus.

Nevkládej do něj feature data.

### D. AppShell

`AppShell` nesmí číst celé:

- Shopping context,
- Calendar context,
- Messages context,
- ostatní feature data contexts

jen proto, aby získal status.

Přesuň globální statusy do malých read-only snapshots.

Zachovej:

- logo reconnect animation,
- realtime status badge,
- offline/degraded signal,
- conversation push bridge,
- active conversation signal.

Pokud `activeConversationId` stále vyžaduje Messages context, vytvoř pro něj malý samostatný bridge/summary context, ale v této vlně nepřesouvej plná message data.

### E. Render-count testy

Přidej testovací instrumentation nebo specializované testy, které ověří:

- update jedné medical položky nererenderuje `AppShell`, pokud realtime summary zůstala stejná,
- shopping item update nererenderuje header pouze kvůli široké context value,
- změna realtime statusu shell naopak rerenderuje,
- registry správně detekuje duplicate instance.

Nepřidávej production render counter.

## Testy

1. registry add/remove lifecycle,
2. duplicate channel warning,
3. idempotent cleanup,
4. StrictMode-like mount/cleanup/remount,
5. active count a owner mapping,
6. production diagnostics disabled contract,
7. AppShell používá úzký status snapshot,
8. item update bez status změny nepropaguje do shellu,
9. logo/status badge reagují na skutečný reconnect,
10. push bridge zůstává funkční.

## Dokumentace

Vytvoř:

```text
docs/implementation/WAVE_3_REALTIME_STATUS_BOUNDARIES.md
```

Zahrň:

- seznam aktivních channels před a po,
- duplicate warnings nalezené při browser QA,
- render-count before/after,
- připravené body pro Calendar a Messages follow-up.

## Co neměnit

- Calendar snapshot ownership,
- počet Calendar subscriptions,
- Messages metadata/content split,
- auth bootstrap,
- offline queues,
- databázové schema.

## Acceptance criteria

- Existuje development-only active realtime registry.
- Duplicate channel instance je viditelná a testovatelná.
- `AppShell` nečte celé feature contexts jen kvůli connection statusu.
- Feature item update bez status změny nevyvolá zbytečný shell/header rerender.
- Production build neobsahuje osobní data ani verbose realtime diagnostics.

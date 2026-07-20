# Rodinka — Repository Wave 3: Reminders, unread stav a serverové zpracování

Navazuj na předchozí repository vlny.

Tato vlna se zaměřuje na:

- reminders,
- notification preferences,
- unread/read state,
- stránkování,
- generování/synchronizaci reminder drafts,
- server-side RPC processing,
- realtime nebo targeted invalidation,
- reminder bell a Reminder Center.

## Cíl

Oddělit:

1. globální reminder summary,
2. paginovaný Reminder Center obsah,
3. serverovou synchronizaci/generování,
4. user preferences,
5. push/device management, pokud je dnes neprávem smíchané s reminder daty.

## Povinná příprava

Vytvoř:

```text
docs/implementation/REPOSITORY_WAVE_3_REMINDERS.md
```

Zmapuj:

- všechny reminder selects,
- RPC,
- preferences reads/writes,
- sync triggers,
- visibility/interval triggers,
- mutation → refresh flows,
- unread count výpočet,
- pagination model,
- související realtime nebo polling.

## Repository hranice

Navrhni minimálně:

```ts
interface ReminderRepository {
  getSummary(scope: ReminderScope): Promise<ReminderSummary>
  listPage(input: ReminderPageQuery): Promise<ReminderPage>
  markRead(id: ReminderId): Promise<Reminder>
  markAllRead(scope: ReminderScope): Promise<ReminderSummary>
  updatePreferences(input: ReminderPreferencesPatch): Promise<ReminderPreferences>
}
```

Server processing může mít samostatné rozhraní:

```ts
interface ReminderProcessingService {
  synchronizeSources(input: ReminderSyncInput): Promise<ReminderSyncResult>
}
```

## Summary vs. content

Globální shell/bell potřebuje pouze:

- unread count,
- případně latest items preview,
- processing/realtime status.

Reminder Center potřebuje:

- stránkované položky,
- filtry,
- historii,
- preferences/device management.

Nenačítej celý seznam reminderů kvůli bell.

## Pagination

Zaveď nebo dokonči cursor/range pagination podle skutečného databázového modelu.

Požadavky:

- stabilní ordering,
- žádné duplicity mezi stránkami,
- bezpečné realtime insert na začátek,
- mark read bez reloadu všech stránek,
- invalidace pouze dotčených pages/summary.

## Server processing

Audituj současný model:

```text
feature contexts change
→ reminder drafts
→ sync RPC
→ reload reminders
```

Odstraň zbytečné sync triggers.

Preferuj reason-based koordinaci:

- source change s relevantním dopadem,
- explicitní app startup/background sync,
- user action,
- scheduled/server processing.

Nespouštěj RPC při každém nerelevantním context rerenderu.

## Application service

Pokud reminder generation čte více domén, service má přijímat explicitní domain snapshots nebo event reason.

Nemá přímo importovat všechny React contexts.

Příklad:

```ts
reminderSyncCoordinator.requestSync({
  reason: 'activity-updated',
  affectedIds: [...]
})
```

## Realtime a optimistic state

- mark read aplikuj targeted,
- realtime echo deduplikuj,
- nový reminder aktualizuje summary a první page,
- smazání/expirace upraví pouze relevantní data,
- pending server processing zobraz jako status, ne jako full reload loop.

## Error mapping

Normalizuj:

- processing failed,
- stale cursor,
- permission denied,
- preference validation,
- network/backend,
- push-specific error nesmí být vydáván za reminder repository error.

## Testy

1. summary načtení bez full listu,
2. page 1/page 2 bez duplicit,
3. realtime insert během pagination,
4. mark read targeted update,
5. mark all read,
6. preferences update,
7. irrelevant source rerender nespustí sync RPC,
8. relevant domain event spustí právě jeden sync,
9. concurrent sync dedupe,
10. server failure a retry,
11. bell a Center parity,
12. no direct Supabase in UI/context,
13. data-access guard,
14. unread count after realtime/optimistic merge.

## Co neměnit

- vizuální redesign Reminder Center,
- push payload schema bez nutnosti,
- ostatní domain repositories,
- reminder business rules bez doloženého bugfixu.

## Acceptance criteria

- Bell používá malý summary model.
- Reminder Center je skutečně stránkovaný.
- Mark read neprovádí full reload.
- Sync RPC se nespouští kvůli nerelevantním rerenderům.
- Server processing má explicitního vlastníka.
- UI/context neobsahují přímé Supabase cally.

# Repository Wave 3 — Reminders, unread stav a serverové zpracování

Audit: [`docs/audits/REPOSITORY_DATA_LAYER_AUDIT.md`](../audits/REPOSITORY_DATA_LAYER_AUDIT.md)
Navazuje na: [Wave 2](REPOSITORY_WAVE_2_ACTIVITIES_OCCURRENCES.md)

## Before

| Co | Kde | Poznámka |
| --- | --- | --- |
| `.from('reminders').select('*')` | `ReminderContext.tsx:132` | **hvězdička**, `limit(300)`, žádná paginace |
| `.from('notification_preferences')` ×5 | `ReminderContext.tsx` | load, create-on-first-use, timezone normalizace, locale sync, save |
| `.rpc('sync_member_reminders')` | `ReminderContext.tsx:282` | serverová generace |
| `.rpc('set_member_reminder_state')` | `ReminderContext.tsx:299` | read/dismiss |
| `mapReminder`, `mapPreferences` | uvnitř contextu | |

**8 přímých volání.** Unread count se počítal klientsky z celého seznamu; bell tedy potřeboval všech 300 reminderů včetně titulků, popisů a metadat, aby zobrazil dvě čísla.

Sync triggery: visibility change, `online`, interval `REMINDER_FOREGROUND_REFRESH_MS`, cross-tab `storage` událost, a efekt závislý na `drafts`. Draft generace běží při emisi kterékoli z osmi zdrojových domén.

## After

```text
src/features/reminders/
  domain/
    reminderMappers.ts   — explicitní sloupce + mapReminder/mapPreferences/summary row
    reminderErrors.ts    — RemindersError s AppErrorCode
  data/
    reminderRepository.ts          — ReminderRepository + ReminderProcessingService
    supabaseReminderRepository.ts  — obě implementace
  application/
    reminderSyncCoordinator.ts     — reason-based koordinace
```

`ReminderContext.tsx` neobsahuje `supabase.*`.

### Summary vs. content

`getSummary()` čte **pět sloupců** (`id, importance, read_at, dismissed_at, resolved_at`) a jen řádky, které mohou být nepřečtené. Bell tak nepotřebuje seznam.

Pravidlo „co je nepřečtené" je jedno: `summaryFromRows` zrcadlí `activeReminders` + `unreadCount` z `reminderPresentation.ts` a test je drží proti sobě nad stejnými daty. Kdyby se rozešly, badge by lhal.

### Paginace

Keyset podle `generated_at` (+ `id` jako tiebreak), ne offset — offset by při každém insertu ze sync RPC posunul řádky pod čtenářem. Repository si vyžádá `limit + 1` řádek, aby zjistil, jestli existuje další stránka, a vrátí `nextCursor`.

Provider drží `hasMore` a `loadMore()`. Slučování stránek deduplikuje podle `id`, takže reminder vložený mezi dvěma čteními se nezobrazí dvakrát.

**Velikost stránky je 100, dřív bylo `limit(300)` bez pokračování.** Reminder Center dnes `loadMore()` nevolá — API a provider jsou připravené, ale tlačítko „načíst starší" je UI změna a zadání zakazuje redesign Centra. Zbývá jako navazující úkol.

### Reason-based sync

`createReminderSyncCoordinator` drží podpis posledních úspěšně synchronizovaných draftů a **zahodí požadavek se stejnými drafty**. Draft generace běží při emisi kterékoli z osmi domén; přejmenovaný úkol nebo přepnutá položka v nákupu produkují identické drafty a dřív přesto spustily RPC i plný reload.

Souběžný požadavek se připojí k běžícímu (`'joined'`) místo druhého RPC. `reason: 'user-action'` jde na server vždy — kdo mačká tlačítko, nemá dostat „nic se nezměnilo".

Selhaný sync se **nezapamatuje** jako synchronizovaný, jinak by se drafty už nikdy neodeslaly. Pokryto testem.

Poznámka: memoizace draftů v contextu (z dřívějšího render batche) zůstává — coordinator je druhá obrana na hranici sítě, ne náhrada.

### Error mapping

`RemindersError` s `AppErrorCode`. Dvě upřesnění: stale cursor → `conflict` (má se začít od začátku, ne opakovat), a validační chyba u preferences (CHECK constraint na timezone/quiet hours) → `conflict`, protože jde o vstup uživatele.

`isReminderRepositoryError()` existuje kvůli explicitnímu požadavku zadání: **push chyba se nesmí vydávat za reminder repository chybu.** Reminder byl vygenerován a uložen správně, jen se nedoručil na zařízení.

## Odchylky

**Application service nekoordinuje contexty.** Zadání varuje před service, který importuje React contexty. `reminderSyncCoordinator` bere explicitní `drafts` a `reason` a o Reactu neví — je to čistá funkce nad `ReminderProcessingService`.

**Reminder Center nemá „načíst starší".** Viz výše: paginace je hotová v datové vrstvě, chybí UI afordance. Acceptance criterion „Reminder Center je skutečně stránkovaný" je proto **splněné jen zčásti** — nechci to prezentovat jako hotové.

**Push/device management jsem nesahal.** Zadání ho zmiňuje podmíněně („pokud je dnes neprávem smíchané"). Není — `PushContext` a `pushClient` jsou oddělené.

## Dopad na guard

```text
po Wave 2:  90 volání mimo datovou vrstvu, reminders 8
po Wave 3:  82 volání mimo datovou vrstvu, reminders 0
```

## Testy

| Soubor | Co pokrývá |
| --- | --- |
| `features/reminders/application/reminderSyncCoordinator.test.ts` | první sync, **skip při nezměněných draftech**, sync při změně, user-action vždy projde, **join souběžného**, retry po selhání, jiná rodina, reset |
| `features/reminders/domain/reminderSummary.test.ts` | **bell počítá totéž co Centrum** (pinned proti `unreadCount`), important unread, přečtené/zahozené/vyřešené se nepočítají |
| `context/ReminderContext.pagination.test.tsx` | první stránka, append bez duplicit, **overlap mezi stránkami se dedupuje**, žádná další stránka, **mark read bez reloadu** |
| `reminderProviderContract.test.ts` | aktualizován — RPC se přesunuly do repository, invariant „stav jen přes RPC" zůstává; přibyl test, že provider nemá přímý Supabase přístup a že summary nečte těžké sloupce |

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 222 souborů, 1363 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| `npm run check:data-access` | ✅ 82 známých volání (z 90) |
| `npm run test:db` | ⚠️ nespuštěno — Docker nedostupný; vlna nemění migrace ani RLS |

## Zbývá

- „Načíst starší" v Reminder Center (UI afordance k hotové paginaci).
- Bell zatím čte summary odvozený z načteného seznamu v contextu; `repository.getSummary()` je implementovaný a otestovaný, ale provider ho ještě nevolá samostatně — to by znamenalo rozdělit `ReminderProvider` na summary a content část, což je větší zásah do stromu providerů, než tato vlna unese.

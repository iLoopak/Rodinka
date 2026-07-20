# P2 offline / cache / sync — stabilizační batch 2

Audit: [`docs/audits/OFFLINE_CACHE_SYNC_AUDIT.md`](../audits/OFFLINE_CACHE_SYNC_AUDIT.md)
Navazuje na: batch 1 (PR #111), `main` @ `e346595`

Dokončuje zbývajících šest P2 nálezů. Žádný z nich nevedl k zobrazení cizích dat — jde o odolnost, údržbu a jeden reálný UX problém (P2-6).

## P2-6 — update-ready UI pro service worker

Nejdůležitější položka batche. Rodinka je pushState SPA a nainstalovaný PWA tab se často nikdy nezavře. Prohlížeč hledá nový service worker jen při navigaci, takže instalace na ploše mohla běžet měsíce starý build bez jakéhokoli signálu.

Řešení má dvě poloviny:

- **Worker** (`public/sw.js`): `activate` nyní volá `self.clients.claim()`, takže aktivovaná verze skutečně převezme otevřený tab místo čekání na reload, který nepřijde. Přibyl handler `{ type: 'SKIP_WAITING' }`.
- **Klient** (`src/push/serviceWorkerUpdates.ts`): registrace sleduje `updatefound` / `registration.waiting` a znovu se ptá na nový deployment při `visibilitychange` (throttle 15 min) a jednou za hodinu. Bez toho by se nikdo nezeptal.

Aktivace zůstává **opt-in**. `skipWaiting()` při installu by vyměnil worker pod rozepsaným formulářem a následný reload by zahodil, co uživatel psal. Banner se proto zeptá, pak pošle `SKIP_WAITING` a reloaduje až na `controllerchange`. Reload je bezpečný vůči neodeslané práci — obě mutation queue leží v IndexedDB a načtou se při startu.

Banner (`ServiceWorkerUpdateBanner`) se montuje vedle `<App />` v `main.tsx`, ne uvnitř `AppShell`, aby se o nové verzi dozvěděl i tab zaparkovaný na fullscreen route nebo na přihlašovací obrazovce.

Guardy, které stojí za zmínku:
- první instalace (`navigator.serviceWorker.controller === null`) se **neohlašuje** — „nová verze" při první návštěvě je nesmysl,
- `controllerchange` reloaduje právě jednou (jinak smyčka),
- `registration.update()` může rejectnout (offline, 404 uprostřed deploye) — polykáme, příští kontrola to dožene.

Testy: `src/push/serviceWorkerUpdates.test.ts` (10 scénářů) + dva contract testy nad `sw.js`.

## P2-3 — retryable chyba blokovala calendar frontu

`performSync` házel z vnitřního loopu při **jakékoli** retryable chybě, takže mutace za tou problémovou se nikdy nedostaly na řadu.

Nově se rozlišuje, co chyba vypovídá o *ostatních* mutacích:

- **transportní** (`network-offline`, `backend-unavailable`, `request-timeout`) — říká něco o celé frontě, takže run se zastaví jako dřív. `attempts` se **nezvyšuje**: týden offline nesmí vyčerpat budget a zaparkovat práci, kterou server nikdy neviděl.
- **cokoli jiného** — týká se jen té jedné mutace, fronta za ní pokračuje.

Navíc `MAX_MUTATION_ATTEMPTS = 5`: retryable chyba, která se opakovaně vrací, retryable v praxi není. Po vyčerpání se mutace zaparkuje jako `failed` a uživatel dostane retry/discard, které kalendář už měl.

Testy: `src/calendar/calendarQueueBlocking.test.ts` (5 scénářů).

## P2-1 — signed URL TTL vs. `maxAgeMs`

Byly to dvě nezávislé konstanty (12 h TTL, 11 h max age), které jen náhodou byly ve správném pořadí. Úprava jedné by tiše rozbila obrázky.

Nově `signedUrlMaxAgeMs(seconds)` v `queryCache.ts` odvozuje max age z TTL s hodinovou rezervou. Obě volací místa ho používají, takže se nemohou rozejít.

Testy: `src/signedUrlCacheContract.test.ts`.

## P2-2 — poškozený IndexedDB záznam

**Už opraveno v batchi 1** přes `isUsableEntry()` + test „treats a corrupt persistent entry as a miss and refetches". Ověřeno, žádná další změna.

## P2-4 — `members` ve třech vrstvách

Nejde o bug, ale o chybějící vlastnictví. Zdokumentováno v `docs/REPOSITORY_ARCHITECTURE.md`: query cache je autoritativní, calendar snapshot a `shoppingFamilyIdentity` jsou odvozené read-only kopie s vysvětlením, proč existují a proč mají záměrně různé lifetime.

## P2-5 — prázdné re-export shimy

`src/repositories/shopping/*` obsahovalo pět souborů, které jen re-exportovaly `src/shopping/*`. Nic je neimportovalo. Odstraněno, `docs/REPOSITORY_ARCHITECTURE.md` opraven — odkazoval na ně jako na „formal repository entry points".

## Vedlejší nálezy

Dva contract testy z batche 1 bylo potřeba opravit, ne smazat:

- `messagingPushContract.test.ts` tvrdil, že `sw.js` nikdy neobsahuje `skipWaiting`. To byl starý záměr; skutečný invariant je nyní „jediné volací místo je message handler" a testuje ho `serviceWorkerUpdates.test.ts`.
- `realtimeStatusBoundaryContract.test.ts` porovnával víceřádkový úryvek se zdrojákem a byl tiše závislý na line endings — rozbil se, jakmile git soubor vrátil s CRLF. Čte teď přes `readSource()`, který je normalizuje.

## Povinné regresní scénáře #8, #10, #14

Tři scénáře ze zadání, které batch 1 nepokryl.

### #8 — opakovaný reconnect nesmí vytvořit duplicitní záznamy

Dosud to stálo na argumentu, ne na testu: oba RPC deduplikují přes ledger klíčovaný `mutationId` / `operationId`. Ten argument platí jen dokud klient (a) nespustí dva syncy nad jednou frontou a (b) nikdy nepřegeneruje klíč. Obojí je nyní připíchnuté.

`shoppingReconnectStorm.test.ts` a `calendarReconnectStorm.test.ts` drží mutaci na drátě, během toho odpálí `online` třikrát, a ověří jeden apply na mutaci. Další dva testy ověří, že se klíč nemění při retry **ani po reloadu** (fronta se načte z IndexedDB novou instancí repository).

### #10 — manuální retry během automatického syncu

Součást stejných souborů: `retryFailed()` / `retry()` zavolané uprostřed běžícího syncu nesmí nic aplikovat dvakrát.

### #14 — offline cold start service workeru

`serviceWorkerColdStart.test.ts` spouští **skutečný fetch handler** z `sw.js` proti fake Cache Storage a `fetch`, který rejectuje. Ostatní testy nad `sw.js` čtou jen zdroják a hledají řetězce, což o chování při vypnuté síti neřekne nic.

Pokryto: navigace bez sítě dostane cachovaný shell, chybějící shell dá čitelnou 503, cachovaný asset se servíruje bez dotazu na síť, cross-origin request se nezachytává.

### Mutation testing

Každý z těchto testů byl ověřen tím, že se dočasně rozbil produkční kód:

| Mutace | Zachyceno |
| --- | --- |
| klíč přegenerován při odeslání | ✅ shopping i calendar |
| odstraněn `syncPromise` guard | ✅ shopping i calendar |
| odstraněn fallback na cachovaný shell | ✅ |
| odstraněn cross-origin guard | ✅ (až po opravě testu, viz níže) |

Dva testy tím prošly jako **falešně zelené** a bylo je potřeba opravit:

- test cross-origin guardu původně používal Supabase REST URL, kterou by handler stejně nezachytil (nesedí `destination` ani cesta). Přepsán na signed URL avataru — cross-origin `image`, přesně tvar, který by runtime asset větev jinak zacachovala. To je zároveň reálné riziko: fotky jedné rodiny v cache sdílené se všemi účty na zařízení.
- calendar reload test měl per-repository čítač id, takže restartovaná instance razila `id-1` znovu a „přegenerovaný" klíč se náhodou shodoval s persistovaným. Čítač je teď sdílený.

## Scénář #6 — permission chyba nesmí odemknout cached data (a nález P0-6)

Tohle mělo být doplnění testu. Ukázalo se, že jde o skutečnou chybu, kterou audit minul.

`useFamily.ts` rozlišuje síťovou a permission chybu správně a má na to testy. Audit z toho usoudil, že acceptance criterion platí — ale neprověřil druhou cestu ke stejným datům: `cachedQuery`. Její stale fallback se spouštěl na **jakoukoli** chybu, tedy i na RLS odmítnutí.

Důsledek: rodič odebraný z rodiny viděl po vypršení `staleTime` dál její roster — jména, data narození, signed URL avatarů — až po dobu `maxAgeMs`, což je pro členy 11 hodin.

`deniesCachedData()` z batche 1 přitom existovalo a bylo otestované, jen nebylo **nikde zapojené**. To je poučení samo o sobě: helper bez volajícího je jen dokumentace záměru.

Oprava v `cachedQuery`:

- `permission-denied`, `auth-expired`, `not-found` → stale fallback se nepoužije, chyba propadne volajícímu,
- `permission-denied` a `not-found` navíc **zahodí i persistentní kopii** — ztráta přístupu není totéž co vypršelý token,
- `auth-expired` kopii nechá: po refreshi session jsou data zase legitimně uživatelova a nemá smysl vynucovat studený refetch,
- transportní chyby a timeouty fungují beze změny, jinak by oprava stála offline režim.

Testy: `src/queryCachePermission.test.ts` (7 scénářů) a `src/hooks/useFamilyMembers.permission.test.tsx` (2 scénáře na user-visible dopad). Ověřeno mutací — odstranění guardu shodí 5 z 9.

**Poznámka k rozsahu:** uvnitř `staleTime` (45 min pro členy) se na server vůbec nesahá, takže tam odebraného člena uklidí až realtime event. To je vlastnost cachování, ne díra v této opravě — ale stojí za to vědět, že okno není nulové.

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 214 souborů, 1292 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| `npm run check:edge-functions` | ✅ |
| `git diff --check` | ✅ |
| `npx supabase start` / `db reset` / `npm run test:db` | ⚠️ **nespuštěno** — Docker není na tomto stroji dostupný. Batch neobsahuje změny migrací ani RLS. |

## Zbývající scénáře ze zadání

Nepokryté zůstávají: **#4** (offline start bez snapshotu), **#1** (online start bez cache, pokryto jen nepřímo), **#13** částečně (corrupt entry jen pro query cache, ne pro shopping/calendar store) a **#15** (push deep link při cold startu).

## Co zůstává neověřené

Service worker se dá otestovat jen do určité míry. `serviceWorkerUpdates.test.ts` běží proti fake `ServiceWorkerContainer`, takže pokrývá naši logiku (kdy ohlásit, kdy mlčet, kdy reloadovat), ale **ne** skutečné chování prohlížeče při `skipWaiting` + `clients.claim`. Ověření na reálném deploymentu — starý tab, nový build, banner, reload — zbývá udělat ručně.

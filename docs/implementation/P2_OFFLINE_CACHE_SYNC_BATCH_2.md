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

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 209 souborů, 1269 testů |
| `npm run build` | ✅ včetně `check:bundle` |
| `npm run check:edge-functions` | ✅ |
| `git diff --check` | ✅ |
| `npx supabase start` / `db reset` / `npm run test:db` | ⚠️ **nespuštěno** — Docker není na tomto stroji dostupný. Batch neobsahuje změny migrací ani RLS. |

## Co zůstává neověřené

Service worker se dá otestovat jen do určité míry. `serviceWorkerUpdates.test.ts` běží proti fake `ServiceWorkerContainer`, takže pokrývá naši logiku (kdy ohlásit, kdy mlčet, kdy reloadovat), ale **ne** skutečné chování prohlížeče při `skipWaiting` + `clients.claim`. Ověření na reálném deploymentu — starý tab, nový build, banner, reload — zbývá udělat ručně.

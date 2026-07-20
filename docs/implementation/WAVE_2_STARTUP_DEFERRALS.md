# Wave 2 — startup deferrals a lazy globální UI

Datum implementace: 20. 7. 2026
Výchozí commit: `35c8727` (`main` po merge PR #102)
Větev: `codex/wave-2-startup-deferrals`

## Výsledek

Wave 2 odstranila čtyři nízkorizikové zdroje práce z cold startupu nebo prvního otevření feature. Globální Create Record controller zůstává stále dostupný, ale tělo wizardu a jeho formuláře se stáhnou až při otevření. `meal_ingredients` a celý seznam push zařízení už nejsou startup requesty. Family route má jediného vlastníka initial `child_accounts` refresh triggeru.

Calendar sync, Messages provider, auth/family bootstrap, offline mutation queues, RLS, databázové schema ani business logika formulářů se neměnily.

## Before / after startup

Počty serverových operací jsou code-path baseline ze startup auditu. Development diagnostika přidaná v této wave umožňuje ověřit přesné hodnoty pro konkrétní session, stav cache a přítomnost obrázků bez logování payloadů.

| Operace | Před Wave 2 | Po Wave 2 | Kdy se provede nyní |
|---|---:|---:|---|
| Odhad minimálních serverových operací cold startupu | přibližně 36 | přibližně 34 | dvě operace jsou odloženy |
| `meal_ingredients` při startupu | 1 | 0 | mount `MealIngredientsSection` |
| `push_subscriptions` device-list read při startupu | 1 | 0 | otevření Reminder settings / device management |
| Current-device push reconciliation | 1 | 1 | startup; zůstává globální |
| `child_accounts` při první návštěvě Family | 2 možné souběžné reads | přesně 1 | mount hooku; další jen změna scope nebo explicitní refresh |
| Signed URL requesty | 0–2 podle avatarů/hero a cache | beze změny | mimo rozsah Wave 2 |

Push registration RPC pro existující browser subscription zůstává součástí current-device reconciliation. Není nahrazen device-list readem a zajišťuje dál obnovu/reconciliaci aktuálního endpointu.

## Bundle before / after

| Metrika | Po Wave 1 / před Wave 2 | Po Wave 2 | Změna |
|---|---:|---:|---:|
| Main JS soubor, raw | 420 788 B | 345 458 B | −17,9 % |
| Main JS soubor, gzip | 114 984 B | 102 357 B | −11,0 % |
| Celý eager JS graf, raw | 847 766 B | 763 080 B | −10,0 % |
| Celý eager JS graf, gzip | 240 392 B | 223 670 B | −7,0 % |
| Hlavní CSS, raw | 180,73 kB | 180,88 kB | +0,15 kB loading UI |

`CreateRecordWizard` je nový dynamic entry chunk o velikosti 11,41 kB raw / 3,40 kB gzip. Jeho formuláře jsou mimo startup closure a Vite je sdílí s příslušnými lazy routes:

- `AddActivityForm`: 23,86 kB,
- `AddPlanEntryForm`: 15,37 kB,
- `AddMedicalRecordForm`: 11,26 kB,
- `AddChoreForm`: 10,19 kB,
- `ShoppingItemForm`: 4,85 kB,
- společné guided fields a ikony v menších shared chunks.

Bundle guard nyní kontroluje i dynamic entry wizardu a zpřísňuje tolerantní budget na 390 kB main raw / 112 kB gzip a 820 kB eager graph raw / 235 kB gzip. Guard zároveň selže, pokud se development startup diagnostika objeví v kterémkoli produkčním JS chunku.

## Create Record wizard

`CreateRecordProvider` dál vlastní open context, selected type, dirty state, submit guard a browser history. Standardní shell mountuje pouze malý `CreateRecordWizardController`.

- Při `isOpen === false` controller vrací `null`; modul těla se neimportuje ani nemountuje.
- Po otevření se lazy-loadne existující `CreateRecordWizard` a dostane již připravený context z provideru.
- Během načítání se zobrazí zavíratelný, přístupný modal fallback s `FamilyMark`.
- Dirty/back/close a submit lifecycle zůstávají v controller contextu, takže lazy hranice je nemění.

## Meal ingredients

Shopping repository zůstává jediným vlastníkem shopping listu a offline queue. Pouze doplňková data ingrediencí mají nový on-demand lifecycle v existujícím `ShoppingContext`:

- `idle` — workflow ingredience ještě nepotřebovalo,
- `loading` — právě běží jediný sdílený request,
- `ready` — explicitní data nebo explicitně prázdný výsledek,
- `error` — online chyba nebo offline stav s retry akcí.

`ensureMealIngredients()` deduplikuje concurrent consumers přes jeden in-flight Promise. Běžný `refreshShopping()` už ingredience nenačítá. Po úspěšném `replace_meal_ingredients` se případný starší request nejprve dokončí a následně proběhne vynucený fresh read, takže se do UI nevrátí stale výsledek.

## Push device split

Globální `PushProvider` při startupu zjišťuje capability a reconciliuje pouze aktuální browser subscription. Z toho odvozuje `currentDevice` a `browserSubscribed` bez čtení celé tabulky.

Plný device list má vlastní `devicesLoading`, `devicesLoaded` a deduplikovaný `loadDevices()` lifecycle. `PushSettings` jej vyžádá až při skutečném otevření settings tabu. Enable/disable/revoke operace obnoví list pouze tehdy, pokud už byl device manager otevřený.

`pushsubscriptionchange` dál provede current-device reconciliation. Je-li device manager otevřený, následně obnoví i seznam; jinak žádný device-list request nepřidá. Disable aktuálního zařízení umí bezpečně revokovat serverový řádek podle endpointu i bez předchozího načtení jeho ID.

## Family child accounts

Initial refresh nyní vlastní pouze `useChildAccounts`. `FamilyScreen` předává hooku stabilní membership/account signature, ale nemá druhý mount effect.

- první návštěva Family: jeden read,
- nová sada member IDs: nový scope read,
- změna account-link/status signature: refresh stejného scope,
- account mutation a manual refresh: explicitní `refresh()` zůstává dostupný.

## Development diagnostika

Development Supabase fetch wrapper agreguje pouze bezpečné čítače:

- REST reads,
- signed URL operace,
- `meal_ingredients` reads,
- `push_subscriptions` device-list reads,
- `child_accounts` reads,
- počet development lazy modulů načtených po otevření wizardu.

Log má prefix `[Rodinka startup]` a obsahuje pouze čítače a elapsed time. Neobsahuje URL, query filtry, IDs, payloady ani osobní data. Diagnostický modul se načítá dynamicky pouze při `import.meta.env.DEV`; produkční bundle guard ověřuje nepřítomnost prefixu ve všech JS chuncích.

## Ověření

- `npm run lint` — úspěch; pouze dříve existující warnings.
- `npm test` — 183 test souborů, 1 061 testů, vše prošlo.
- `npm run build` — úspěch včetně zpřísněného bundle guardu.
- `npm run build:analyze` — úspěch; wizard i formuláře jsou mimo eager closure.
- `npm run check:edge-functions` — všechny tři edge grafy prošly.
- `git diff --check` — bez whitespace chyb.

Nové regresní testy pokrývají zavřený a kontextově otevřený lazy wizard, nulový startup ingredient read, concurrent ingredient deduplikaci, current push stav bez device listu, on-demand device management, `pushsubscriptionchange`, jediný initial child-account read, membership scope refresh, bezpečnou request klasifikaci a návrat wizardu do main bundle.

## Zbývající P0 startup operace

- Calendar offline snapshot stále provádí přibližně deset paralelních reads a odpovídající subscriptions; řeší Wave 4.
- Globální provider graph stále eager mountuje Chores, Activities, Medical, Meals, Reminders a Messages summary/data hranice.
- Realtime status používá široké contexts; diagnostika a užší status rozhraní patří do Wave 3.
- Messages metadata/content a signed URL lifecycle zůstávají spojené; řeší Wave 5.
- Auth/family bootstrap stále čeká na sekvenční fáze; řeší Wave 6.

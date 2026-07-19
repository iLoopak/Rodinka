# Offline kalendář

Kalendář navazuje na offline infrastrukturu nákupního seznamu. Obě funkce používají jednu verzovanou IndexedDB databázi `rodinka-offline`; service worker dál ukládá pouze aplikační shell a statické assety a necacheuje Supabase API odpovědi.

## Lokální data

Kalendář odděluje tři vrstvy:

1. **Serverový snapshot** v `calendarSnapshots` obsahuje události/aktivity, úkoly a jejich dokončení, zdravotní termíny, plán jídel, kapesné, occurrence overrides a historii přiřazení i členy rodiny. Snapshot je omezen na šest měsíců zpět a dvanáct měsíců dopředu; aktivní opakované aktivity bez konce zůstávají zahrnuté. Ukládá se také čas poslední úspěšné aktualizace a pokrytý rozsah.
2. **Pending operace** v `calendarMutations` obsahují offline vytvořené úkoly a aktivity. Každá operace má `operationId`, stabilní `localId`, účet, rodinu, autora, payload, počet pokusů, chybu a stav `pending`, `syncing` nebo `failed`.
3. **Zobrazený stav** vzniká deterministickým sloučením pending operací nad serverovým snapshotem. Pending záznam proto zůstane viditelný po reloadu i po chybě synchronizace.

Klíč snapshotu je `userId:familyId`. Jiný účet ani jiná rodina tento scope nenačtou. Při odhlášení se kalendářová data účtu i cache jeho rodinné identity odstraní. Lokální formát má vlastní `schemaVersion`; neznámá verze se bezpečně znepřístupní/resetuje.

## Synchronizace

Repository sleduje návrat online, návrat aplikace do popředí a Realtime změny relevantních tabulek. `navigator.onLine` používá jen jako rychlý signál; za skutečné ověření backendu se považuje až úspěšné volání RPC a následné stažení snapshotu.

Postup synchronizace:

1. Persistovaná operace se označí jako `syncing`.
2. RPC `apply_calendar_mutation` znovu ověří aktivní členství dospělého v dané rodině a všechny odkazy na členy.
3. Lokální UUID se použije jako serverové ID. Tabulka `calendar_sync_operations` a transakční advisory lock deduplikují opakované `operationId`; unikátní kombinace rodiny, typu a lokálního ID chrání i proti retry s jiným operation ID.
4. Po uploadu se stáhne aktuální serverový snapshot. Teprve potom se úspěšná operace odstraní z lokální fronty.
5. Dočasná chyba ponechá operaci ve frontě a spustí omezený exponenciální retry (maximálně jednou za minutu). Validační nebo oprávňovací chyba se označí `failed` a automaticky se neopakuje.

Uživatel může chybový lokální záznam v detailu opravit, ručně zopakovat nebo po potvrzení zahodit. Při pádu po serverovém commitu, ale před lokálním potvrzením je další pokus idempotentní.

## UX a omezení

- Měsíční, týdenní i agenda pohled fungují nad snapshotem a dovolují běžnou navigaci.
- Offline lišta ukazuje poslední úspěšnou aktualizaci. Pending položky mají jemný stav v řádku, týdnu, měsíčním indikátoru i detailu.
- Existující serverové záznamy jsou offline pouze pro čtení. Offline mazání ani conflict resolution editací není součástí tohoto batche.
- Přes existující průvodce lze offline vytvořit **úkol** a **aktivitu/událost**, včetně názvu, data/času nebo celodenního režimu, členů, poznámky a podporovaného opakování. Zdravotní záznamy, jídelníček, kapesné a další typy jsou ve snapshotu čitelné, ale jejich vytvoření offline je záměrně vypnuté a UI omezení vysvětluje.
- Synchronizace probíhá v otevřené aplikaci. Service worker záměrně neposílá Supabase mutace na pozadí, což zachovává předvídatelné chování iOS PWA a brání nekontrolovanému cachování API.

# Rodinka — Repository Wave 5: Messages

Navazuj na dokončené vlny 1–4 (`docs/audits/REPOSITORY_DATA_LAYER_AUDIT.md`).

Tato vlna **nebyla v původním plánu**. Audit ji označil jako druhou nejzatíženější doménu, kterou plán přeskočil, a doporučil, aby to bylo vědomé rozhodnutí, ne opomenutí. Tohle je to rozhodnutí.

## Proč samostatná vlna

Messages je co do objemu větší než vlny 1 a 2 dohromady a co do rizika největší doména v aplikaci:

| | Volání | Soubory | RPC |
| --- | --- | --- | --- |
| Wave 1 Meals | 16 | 4 | 2 |
| Wave 2 Activities | 8 | 4 | 3 |
| **Messages** | **30** | **2** (~1 340 řádků) | **13** |

Rozdíl není jen v počtu. U allowance je nejhorší následek chyby špatné číslo na obrazovce. Tady je to **ztracená nebo zdvojená zpráva** a **osiřelá příloha ve storage**.

## Co je dnes kde

### `useMessagesContentSource.ts` (878 řádků, 22 volání)

| Oblast | Volání |
| --- | --- |
| Čtení | `.from('messages')`, `.from('message_reactions')`, `.from('message_attachments')` |
| Odeslání | `rpc:send_message` |
| Editace | `rpc:edit_message`, `rpc:delete_message` |
| Reakce | `rpc:add_message_reaction`, `rpc:remove_message_reaction` |
| Přílohy | storage upload/remove/sign, `rpc:register_message_attachment`, `rpc:discard_pending_attachment` |
| Entity | `rpc:resolve_message_entities`, `rpc:post_entity_system_message` |
| Realtime | jeden kanál, více tabulek |

### `useMessagesSummarySource.ts` (460 řádků, 8 volání)

`.from('conversations')`, `.from('conversation_members')`, `rpc:ensure_family_group_conversation`, `rpc:ensure_direct_conversation`, `rpc:share_entity_to_conversation`, `rpc:set_conversation_mute`, `rpc:mark_conversation_read`.

## Povinná příprava

Před změnou zapiš do `docs/implementation/REPOSITORY_WAVE_5_MESSAGES.md` before stav pro:

- všechny selecty, RPC, storage a realtime cesty,
- **lifecycle přílohy** (viz níže) včetně každé cesty, kde může vzniknout osiřelý objekt,
- optimistickou cestu odeslání a re-keying příloh,
- keyset pagination v `loadOlderMessages`,
- unread/mute model a jeho vazbu na presence a push.

## Invarianty, které nesmí padnout

Tohle je jádro zadání. Každý bod musí mít test.

### 1. `client_id` je idempotency key

`send_message` bere `p_client_id` a `retryFailedMessage` **záměrně posílá stejný `clientId`**. Server podle něj deduplikuje. Stejný invariant jako u shopping a calendar queue z offline batche.

Test musí ověřit, že se klíč nemění při retry ani po remountu. Přegenerování klíče = zdvojená zpráva.

### 2. Optimistický řádek a jeho nahrazení

Odeslání vytvoří `MessageRow` s `id: 'pending:${clientId}'`, po úspěchu se nahradí serverovým řádkem a **přílohy se překlíčují z `pending:` id na skutečné**. Selhání ponechá řádek s `deliveryStatus: 'failed'`, aby šel opakovat.

Testy: úspěch nezdvojí zprávu, realtime echo vlastní zprávy nezdvojí, selhání nechá řádek retryovatelný, retry po selhání dojde.

### 3. Lifecycle přílohy

```text
validace → komprese → storage upload → register_message_attachment (pending row)
   → připojení k message při send
   nebo → discard_pending_attachment + storage remove
```

Dnes existují **tři** úklidové cesty (abort po uploadu, selhání RPC, explicitní discard) a jedna díra: když upload projde a tab se zavře před `register`, objekt zůstane osiřelý.

Vlna má lifecycle **popsat a otestovat**, ne přepsat. Pokud se rozhodneš díru zavřít, musí to být samostatný, doložený krok — ne vedlejší efekt refaktoru.

### 4. Keyset pagination

`loadOlderMessages` stránkuje přes `(created_at, id)` a přeskakuje `pending:` řádky při hledání nejstaršího. Offset by pod čtenářem posunul řádky pokaždé, když dorazí nová zpráva.

Testy: stránka 2 bez duplicit, příchozí zpráva během stránkování, `olderExhausted` se nastaví jen když server opravdu nic nevrátil.

### 5. Presence a push zůstávají mimo repository

`conversationPresence.ts` a push jsou infrastruktura se schválenou výjimkou. Repository je **nesmí** pohltit. `mark_conversation_read` a presence heartbeat jsou dvě různé věci a musí zůstat oddělené.

Push chyba se nikdy nesmí vydávat za messages repository chybu — stejné pravidlo jako u reminderů ve vlně 3.

## Navrhované hranice

```text
src/features/messages/
  domain/
    messageTypes.ts      — MessageRow bez client-only polí, viz níže
    messageMappers.ts    — sloupce + mappery pro message/reaction/attachment/conversation
    messageErrors.ts     — MessagesError s AppErrorCode
  data/
    messageAttachmentStorage.ts   — bucket message-attachments, po vzoru familyMediaStorage
    conversationsRepository.ts    — konverzace, unread, mute, share
    messagesRepository.ts         — zprávy, reakce, přílohy, entity, realtime
```

Dvě repositories, ne jedna. Summary (seznam konverzací, unread) a content (zprávy v konverzaci) mají různé konzumenty a různou životnost — stejné dělení jako bell vs. Reminder Center ve vlně 3.

### `deliveryStatus` patří klientovi

`MessageRow` dnes míchá serverové sloupce s `deliveryStatus` a `deliveryError`. Mapper by neměl vracet typ, který obsahuje pole, jež v databázi neexistují.

Návrh: `Message` (server) a `PendingMessage`/`MessageView` (server + doručovací stav) jako oddělené typy. **Posuď blast radius** — pokud sahá do mnoha komponent, zdokumentuj a odlož, jako se odložilo camelCase ve vlnách 1–2.

## Error mapping

Minimálně: `permission-denied` (nečlen konverzace), `not-found` (smazaná zpráva), `conflict` (editace smazané, reakce na smazanou, druhý discard), `storage-quota`, transport.

Editace zprávy, kterou mezitím někdo smazal, je `conflict`, ne `not-found` — uživatel má načíst znovu.

## Co neměnit

- vizuální redesign chatu,
- payload push notifikací,
- presence heartbeat a jeho pravidla,
- `unreadMarks.ts` (čistá logika s vlastními testy),
- schema zpráv a příloh,
- ostatní repositories.

## Testy

1. mappery (message, reaction, attachment, conversation),
2. **`client_id` stabilní přes retry**,
3. optimistický send → server row bez duplicity,
4. **realtime echo vlastní zprávy nezdvojí**,
5. selhání → `failed` → retry dojde,
6. re-keying příloh z `pending:` na reálné id,
7. upload → register → send happy path,
8. abort po uploadu uklidí objekt,
9. selhání `register` uklidí objekt,
10. discard uklidí metadata i objekt,
11. keyset stránkování bez duplicit,
12. příchozí zpráva během stránkování,
13. edit/delete/reakce targeted, bez reloadu konverzace,
14. `mark_conversation_read` nesmí sáhnout na presence,
15. permission error nevrátí cizí konverzaci,
16. data-access guard,
17. bundle: messages je lazy route, datová vrstva nesmí do eager grafu.

Bod 17 je konkrétní riziko: ve vlně 4 se eager rozpočet zvedl kvůli tomu, že family contexty jsou na startovní cestě. Messages je lazy — pokud po této vlně eager graf vyroste, něco se do něj vtáhlo omylem.

## Acceptance criteria

- `useMessagesContentSource` a `useMessagesSummarySource` neobsahují přímý Supabase přístup.
- `client_id` idempotence je otestovaná, ne jen popsaná.
- Lifecycle přílohy je zdokumentovaný včetně známé díry, a každá úklidová cesta má test.
- Konverzace a obsah mají oddělená repositories.
- Presence a push zůstávají mimo repository hranici.
- Eager bundle nevyroste.
- `npm run check:data-access` klesne o 30 volání (38 → 8).

## Validace

```bash
npm run lint
npm test
npm run build
npm run check:edge-functions
npm run check:data-access
git diff --check
```

Při zásahu do RPC nebo RLS navíc `npm run test:db`.

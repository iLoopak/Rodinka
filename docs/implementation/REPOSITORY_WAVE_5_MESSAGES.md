# Repository Wave 5 — Messages

Brief: [`docs/audits/p1/06_REPOSITORY_WAVE_MESSAGES.md`](../audits/p1/06_REPOSITORY_WAVE_MESSAGES.md)
Audit: [`docs/audits/REPOSITORY_DATA_LAYER_AUDIT.md`](../audits/REPOSITORY_DATA_LAYER_AUDIT.md)

## Before

| Soubor | Volání |
| --- | --- |
| `useMessagesContentSource.ts` (878 ř.) | 22 — `messages`, `message_reactions`, `message_attachments`, 9 RPC, storage upload/remove/sign |
| `useMessagesSummarySource.ts` (460 ř.) | 8 — `conversations`, `conversation_members`, 5 RPC |

**30 volání, 13 různých RPC.** Sloupce pro reakce a přílohy byly psané inline na místě volání.

## After

```text
src/features/messages/
  domain/
    messageMappers.ts       — sloupce + mappery pro message/reaction/attachment
    conversationMappers.ts  — sloupce konverzací (oddělené, viz bundle)
    messageErrors.ts        — MessagesError s AppErrorCode
  data/
    messageAttachmentStorage.ts   — jediný vlastník bucketu
    messagesRepository.ts         — rozhraní obsahu
    supabaseMessagesRepository.ts — implementace
    conversationsRepository.ts    — rozhraní i implementace konverzací
```

Oba zdroje mají nulový přímý přístup k Supabase.

## Invarianty z briefu

### `client_id` jako idempotency key

`send_message` deduplikuje podle `p_client_id` a `retryFailedMessage` **záměrně posílá klíč původního pokusu**. Repository ho pouze předává — nikdy negeneruje vlastní. Test to hlídá i staticky (`randomUUID` se v těle `send` nesmí objevit), protože vygenerovaný klíč při retry znamená druhou zprávu bez jakékoli chybové hlášky.

Stejný klíč chrání i `share_entity_to_conversation`. Tam fallback na `randomUUID()` zůstává, protože share nemá retry cestu, která by musela klíč znovupoužít.

### Lifecycle přílohy

```text
validace → komprese → upload objektu → register_message_attachment → připojení při send
```

Mezi uploadem a registrací existuje objekt, na který nic neodkazuje. Repository proto uklízí na **každé** cestě, která tam skončí:

| Cesta | Chování | Test |
| --- | --- | --- |
| abort **před** uploadem | neuploaduje se nic | ✅ |
| abort **po** uploadu | objekt se smaže, registrace se nespustí | ✅ |
| selhání registrace | objekt se smaže | ✅ |
| explicitní discard | metadata i objekt, i když první půlka selže | ✅ |
| selhání podpisu | příloha se **vrátí** bez URL — zpráva je pořád čitelná | ✅ |

**Známá díra, kterou tato vlna nezavírá:** pokud upload projde a tab se zavře před registrací, objekt osiří a nezůstane klient, který by ho uklidil. Zavření vyžaduje serverový sweep nereferencovaných objektů — samostatná změna, jak brief požaduje. Zdokumentováno v `messageAttachmentStorage.ts`.

### Optimistický řádek

`pendingMessageId(clientId)` je jediné místo, které tvoří `pending:` id. Stránkování se na pending řádky **nekotví** — `loadOlderMessages` hledá nejstarší serverový řádek, protože pending nemá v keyset uspořádání co dělat.

`deliveryStatus` zůstal na `MessageRow` jako client-only pole. Mapper ho **nikdy nevyrábí** — to je hranice, kterou brief požadoval; rozdělení typu na server/view je většího rozsahu a odloženo stejně jako camelCase ve vlnách 1–2.

### Presence a push mimo repository

`conversationPresence.ts` a push zůstávají v `src/push`. `markRead` píše `last_read_at`; presence heartbeat říká „někdo se na to teď dívá" kvůli potlačení push. Dvě různé věci, komentář v `conversationsRepository` to říká explicitně.

## Bundle

Brief nastavil kritérium „eager graf nevyroste", protože messages je lazy route. První build **rozpočet překročil**: summary layer je mountovaný globálně, takže s ním do startu šly i mappery zpráv, reakcí a příloh.

Řešení: `conversationMappers.ts` odděleně, a `shareEntity` vrací řádek beze změny místo importu `mapMessage`. Výsledek **233 828 B** proti rozpočtu 234 000 — bez zvyšování rozpočtu.

Poctivě: proti stavu před vlnou to je +335 B. Conversations repository je legitimně eager, protože summary layer je globální. Není to nula, ale je to cena vrstvy, ne omylem vtažený obsah.

## Opravené contract testy

| Test | Co se změnilo |
| --- | --- |
| `messagesSummarySplitContract` | hranice se přesunula z „kdo volá `.from()`" na „kdo importuje které repository". **Přísnější než dřív** — summary layer teď nesmí obsahový repository ani importovat. |
| `markConversationReadLoop` | regex se kotvil na přesné dependency pole; invarianty (in-flight guard, debounce, žádné vracení kurzoru, zápis až po guardech) platí dál |

## Nalezené při implementaci

`share_entity_to_conversation` má **víc parametrů, než jsem předpokládal** (`p_client_id`, `p_fallback_label`, `p_body` trimnutý na null) a vrací řádek zprávy, ne id. Kdybych to nezkontroloval proti zdroji, sdílení entit by tiše přestalo fungovat.

Podobně `edit_message` a `delete_message` vracejí aktualizovaný řádek — rozhraní jsem měl původně jako `void`.

## Dopad na guard

```text
před:  38 volání mimo datovou vrstvu, messages 30
po:     8 volání, messages 0
```

Zbývá 8: chores 3, shopping 2, family 2, medical 1 — vše zdokumentované v předchozích vlnách.

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 228 souborů, 1394 testů |
| `npm run build` | ✅ včetně `check:bundle`, bez zvýšení rozpočtu |
| `npm run check:data-access` | ✅ 8 známých volání (z 38) |
| `npm run test:db` | ⚠️ nespuštěno — Docker nedostupný; vlna nemění migrace ani RLS |

## Zbývá

- Serverový sweep osiřelých příloh (viz výše).
- Rozdělení `MessageRow` na server a view typ.
- 8 zbývajících volání napříč doménami.

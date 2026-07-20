# Wave 5 — Messages summary/content split

## Shrnutí

Messaging modul je rozdělený na dvě vrstvy s odlišným životním cyklem. Globálně zůstává jen to, co potřebuje shell a push: metadata konverzací, unread počty, aktivní konverzace a zápisy, které musí fungovat z libovolné obrazovky. Stránky zpráv, reakce, přílohy, signed URL a entity karty se načítají až při vstupu na `/messages` a uvolní se při odchodu.

`MessagesContext.tsx` a `useMessagesDataSource.ts` (1 235 řádků, jeden kontext pro vše) byly nahrazeny:

| Soubor | Rozsah | Kdy je mounted |
|---|---|---|
| `useMessagesSummarySource.ts` | konverzace, členové, unread, aktivní konverzace, zápisy | globálně (`AppDataProviders`) |
| `MessagesSummaryContext.tsx` | čtyři úzké kontexty nad summary | globálně |
| `useMessagesContentSource.ts` | zprávy, reakce, přílohy, signed URL, entity | pouze route `/messages` |
| `MessagesContentContext.tsx` | provider obsahu | pouze route `/messages` |
| `messageStream.ts` | přenos řádků `messages` mezi vrstvami | globálně |
| `unreadMarks.ts` | čisté počítání nepřečtených | globálně |
| `messageMerge.ts` | čisté merge pravidlo vlákna (přesunuto beze změny) | route |

## Hranice contextů

Summary provider nevystavuje jeden široký objekt, ale čtyři kontexty podle toho, co konzument skutečně čte:

| Hook | Konzument | Co invaliduje |
|---|---|---|
| `useTotalUnreadCount()` | `MessagesBell` | pouze změna čísla |
| `useActiveConversationId()` | `AppShell` → push bridge | pouze změna aktivní konverzace |
| `useMessagesActions()` | share dialogy, route | nic po mountu — identita je stabilní |
| `useMessagesSummary()` | seznam konverzací na `/messages` | metadata konverzací |

`ShareToChatButton` (Shopping, detail úkolu, detail aktivity) čte summary a actions. Nikdy nesahá na obsah, takže sdílení entity z jiné obrazovky nenačte chat.

## Realtime ownership

| Kanál | Tabulky | Vlastník | Kdy otevřený |
|---|---|---|---|
| `family:<id>:messages` | `conversations`, `conversation_members`, `messages` | `MessagesSummaryProvider` | vždy |
| `family:<id>:messages-content` | `message_reactions`, `message_attachments`, `message_entity_refs` | `MessagesContentProvider` | pouze na `/messages` |

Tabulka `messages` má i po rozdělení **jediného** vlastníka odběru. Summary vrstva zapíše řádek do unread evidence a přepošle ho přes `messageStream` do obsahové vrstvy. Nevzniká druhý odběr, žádná událost se neaplikuje dvakrát a obě vrstvy zůstávají nezávislé stores — obsah není odvozený ze summary ani naopak.

Globálně aktivní počet subscribovaných messaging tabulek klesl z **6 na 3**.

## Unread bez obsahu zpráv

Před rozdělením se přesný unread počítal z celého seznamu zpráv v paměti — proto musel být chat globální. Nyní summary drží jen `UnreadMark { id, createdAt }`:

- **netrackovaná konverzace** → `last_message_at > last_read_at` znamená `1`, tedy „něco nového“. Přesně to, co dělala aplikace i před Wave 5 pro nenačtenou konverzaci;
- **trackovaná konverzace** (obsahová vrstva ohlásila načtenou stránku přes `registerLoadedMessages`) → přesný počet značek novějších než read cursor.

Pravidla zůstala identická: vlastní zprávy se nepočítají, smazané se nepočítají, optimistický `pending:` řádek se nepočítá. Značky přežijí odchod z route, takže badge po opuštění chatu neztratí přesnost, a realtime insert/soft-delete je aktualizuje i mimo `/messages`.

Značka nenese tělo zprávy, odesílatele ani přílohu — není to druhá kopie vlákna.

## Push a presence

Beze změny zůstává `RODINKA_IS_CONVERSATION_OPEN`, `RODINKA_OPEN_CONVERSATION`, presence heartbeat, cold-start deep link s `?c=`/`?m=`, scroll-to-message i mark-as-read. `useConversationPushBridge` je dál mounted v `AppShell`, protože musí odpovídat service workeru z každé obrazovky.

Jedna oprava chování: `activeConversationId` se nyní při odmountování route vynuluje. Dřív zůstal nastavený i po odchodu z chatu, takže presence dál potlačovala push pro konverzaci, na kterou se uživatel už nedíval.

## Before / after

| Metrika | Před | Po |
|---|---:|---:|
| Startup Messages reads | `ensure_family_group_conversation` + `conversations` + `conversation_members` | beze změny (3) |
| Startup Messages **content** reads | 0 při startu, ale plný lifecycle v hlavním chunku | 0 a mimo hlavní chunk |
| Globálně subscribované messaging tabulky | 6 | 3 |
| Messaging realtime kanály při startu | 1 (6 tabulek) | 1 (3 tabulky) |
| Messaging realtime kanály na `/messages` | 1 | 2 |
| Main entry JS | 348 747 B raw / 103 141 B gzip | **336 868 B raw / 100 197 B gzip** |
| Eager JS graph | 767 944 B raw / 225 122 B gzip | **756 065 B raw / 222 178 B gzip** |
| `MessagesScreen` chunk | 61,59 kB / 15,47 kB gzip | 76,18 kB / 19,63 kB gzip |
| Rerender `AppShell`/bell při nové cizí zprávě | shell i bell (široký context) | pouze bell, a jen když se změní číslo |
| Rerender `AppShell`/bell při vlastní zprávě | shell i bell | ani jeden |

Nárůst `MessagesScreen` chunku je záměrný: obsahová vrstva se přesunula z hlavního bundle do route chunku. Rozpočet v `scripts/check-route-chunks.mjs` byl utažen na 372 000 B raw / 110 000 B gzip pro entry a 800 000 B raw / 232 000 B gzip pro eager graf.

Memory cleanup po opuštění chatu: `messagesByConversation`, `reactionsByMessage`, `attachmentsByMessage`, `attachmentSignedUrls` a `entityByMessage` zanikají s providerem. Signed URL se nikde nekumulují napříč návštěvami.

## Testované scénáře

Nové testy (`src/context/messages/unreadMarks.test.ts`, `src/context/messages/messagesSummarySplit.test.tsx`, `src/messagesSummarySplitContract.test.ts`):

- globální mount nenačte `messages`, `message_reactions`, `message_attachments` ani `resolve_message_entities`;
- badge ukáže přibližný počet z metadat a přesný po načtení stránky;
- unread zůstává přesný po odmountování route a reaguje na realtime insert i soft-delete mimo `/messages`;
- tabulka `messages` má právě jednoho vlastníka odběru; obsahový kanál nese jen tři content tabulky;
- jeden realtime insert se ve vlákně projeví právě jednou;
- změna obsahu bez změny unread nererenderuje shell ani bell;
- vlastní zpráva se nezapočítá, smazaná se odečte, optimistický řádek se nepočítá;
- statické pinování hranice: žádný globálně mountovaný modul neimportuje obsahovou vrstvu, shell drží úzký signál, route provider mountuje obsah, push handshake a nulování aktivní konverzace zůstávají.

Zachované regresní testy: merge optimistické zprávy s realtime ozvěnou (`messageMerge.test.ts`), runaway `mark_conversation_read` guard (nyní pinovaný nad summary vrstvou), entity picker, chat contract, push contract, realtime status boundary z Wave 3.

## Validace

```
npm run lint                 ✓ (pouze předchozí warningy)
npm test                     ✓ 191 souborů / 1 115 testů
npm run build                ✓ + route chunk guard passed
npm run check:edge-functions ✓
git diff --check             ✓
```

`npm run test:db` nebyl spuštěn — vlna nemění databázové ani authorization hranice a lokální Supabase stack nebyl v této relaci dostupný.

Browser QA nebylo provedeno; hodnoty pocházejí z buildu a z deterministických testů. Ověření unread badge, deep linku a push suppression v přihlášené relaci zůstává jako manuální krok.

## Záměrně beze změny

- databázový messaging model, RLS a všechny RPC write paths;
- UI design chatu, composer, lightbox, mobile portal;
- push payload schema;
- Family, Calendar a Shopping provider architektura;
- merge pravidla vlákna (přesunuta do `messageMerge.ts` beze změny logiky).

## Follow-up pro Wave 6

- `useMessagesSummarySource` je teď jediný messaging fetch v kritické startup cestě; při paralelizaci auth/family bootstrapu ho lze bez rizika odložit za první použitelný render;
- `registerLoadedMessages` je jediný kanál, kterým obsahová vrstva ovlivňuje summary — případný cached-validating stav ho nesmí obejít.

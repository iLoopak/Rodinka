# Rodinka — Wave 5: Messages summary/content split

Navazuj na route lazy loading a realtime registry.

Cílem je oddělit globálně potřebný chat summary stav od těžkého route-specific obsahu zpráv.

Globálně musí zůstat:

- unread counts,
- seznam nebo minimální metadata konverzací potřebná pro badge,
- active conversation signal pro push suppression,
- push/deep-link bridge,
- bezpečné vytvoření rodinné konverzace.

Route-specific má být:

- message pages,
- reactions,
- attachments,
- signed URLs,
- entity refs,
- composer,
- picker dialogs,
- lightbox a další těžké UI.

## Cíle

1. Rozdělit Messages data lifecycle na summary a content.
2. Omezit globální subscriptions a rerender fan-out.
3. Zachovat jediného vlastníka každého realtime eventu.
4. Zachovat optimistic send, unread a push suppression.
5. Nenačítat message content mimo Messages route nebo explicitní deep link.

## Návrh hranic

### A. Messages summary

Příklad:

```ts
interface MessagesSummaryState {
  conversations: ConversationSummary[]
  totalUnread: number
  activeConversationId: string | null
  realtimeStatus: RealtimeConnectionState
}
```

Summary může být globální.

Obsahuje pouze data nutná pro:

- `MessagesBell`,
- shell,
- push bridge,
- route entry,
- unread badges.

### B. Conversation content

Příklad:

```ts
interface ConversationContentState {
  messages: Message[]
  hasMore: boolean
  loading: boolean
  reactions: unknown
  attachments: unknown
  entities: unknown
}
```

Content se mountuje nebo aktivuje:

- na `/messages`,
- při direct deep linku do konverzace,
- případně v explicitním share workflow, pokud skutečně potřebuje message content.

## Realtime

Urči jediného vlastníka subscriptions.

Doporučený směr:

- summary layer vlastní conversation metadata a unread-relevant events,
- active content layer vlastní content-specific detail nebo odebírá shared normalized event stream,
- jedna message událost nesmí být dvakrát aplikována,
- optimistic local message nesmí po realtime echo vzniknout duplicitně.

Pokud je výhodnější jeden transport channel, může zůstat jeden channel, ale events musí být distribuovány do oddělených stores bez širokého React contextu.

## Loading a route lifecycle

Při vstupu do Messages:

- summary metadata mají být okamžitě dostupná,
- aktivní conversation content se načte on demand,
- předchozí conversation cache může zůstat v krátkodobém in-memory cache,
- staré stránky se nemají persistentně cachovat bez potřeby.

Při opuštění Messages:

- globální unread summary zůstává,
- těžké content state může být uvolněno nebo zachováno v omezené cache,
- signed URLs a attachment objects nesmí leakovat bez limitu.

## Push a presence

Zachovej:

- `RODINKA_IS_CONVERSATION_OPEN`,
- `RODINKA_OPEN_CONVERSATION`,
- active/focused conversation heartbeat,
- suppression push při skutečně otevřeném chatu,
- cold-start deep link s conversation/message ID,
- scroll-to-message,
- mark-as-read.

Active conversation signal přesuň do malého summary/presence store, ne do plného content contextu.

## Testy

1. shell a bell používají pouze summary store,
2. message pages se nenačítají na Home,
3. otevření Messages načte content on demand,
4. direct deep link otevře správnou conversation,
5. cold-start push funguje po lazy route load,
6. optimistic send + realtime echo nevytvoří duplicitu,
7. unread count se aktualizuje mimo Messages route,
8. otevřená conversation potlačí push,
9. sibling direct-chat privacy zůstává,
10. route unmount neuvolní potřebný summary/presence stav,
11. reactions/attachments/entity refs nejsou startup request,
12. AppShell nererenderuje kvůli každé content změně.

## Měření

Zapiš before/after:

- startup Messages request count,
- počet globálně aktivních Messages subscriptions,
- velikost main a Messages chunku,
- render count AppShell při nové message,
- memory cleanup po opuštění chatu.

## Dokumentace

Vytvoř:

```text
docs/implementation/WAVE_5_MESSAGES_SUMMARY_SPLIT.md
```

## Co neměnit

- databázový messaging model,
- RLS,
- RPC write paths,
- message UI design,
- push payload schema bez nutnosti,
- Family/Calendar/Shopping provider architecture.

## Acceptance criteria

- Message content se nenačítá na Home.
- Globální shell používá malý summary/presence store.
- Unread, optimistic send, push deep links a push suppression zůstávají funkční.
- Nevznikají duplicate realtime events ani duplicate messages.
- Content update bez summary změny nererenderuje AppShell.

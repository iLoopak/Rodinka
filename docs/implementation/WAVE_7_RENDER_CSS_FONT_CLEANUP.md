# Wave 7 — rerender, CSS a font performance cleanup

Zadání výslovně žádalo neopírat se o statický audit, ale měřit. Měření změnilo dvě ze šesti sekcí na „neprovádět" a jednu z nich na „provést by byla regrese".

## Co měření ukázalo dřív, než se sáhlo na kód

| Sekce | Předpoklad auditu (`558757f`) | Naměřený stav | Akce |
|---|---|---|---|
| A. Context values | 13 providerů skládá value bez `useMemo` | memoizovaných je 15 souborů; inline objekt zůstal ve **dvou** | opraveny ty dva |
| B. Reminder fan-out | drafts se přepočítávají moc často | přepočet je levný; **sync RPC** se volal při každé nesouvisející změně | opraveno |
| C. Router value | inline value | potvrzeno; akce byly stabilní, ale `?c=` rerenderovalo všechny | rozděleno na tři contexty |
| D. CSS | 214 kB globální monolit | potvrzeno | tokens/base odděleny, chat přesunut do route chunku |
| E. Fonty | 40 assetů / 368 kB, „browser typicky nestahuje vše" | browser stahuje **2–5 souborů / 22–64 kB**; SW precachuje jen 4 shell URL | **žádná změna**, viz níže |
| F. Budgets | — | — | přidány CSS rozpočty a guard route CSS |

Vlny 3–6 mimoděk vyřešily většinu sekce A. Zbylé dva inline objekty byly `ReminderContext` a `router`.

## A + C. Router rozdělen na tři contexty

Router publikoval jeden inline objekt, takže otevření konverzace (`?c=`) rerenderovalo každého konzumenta `useRouter()` — včetně spodní navigace a hlavičky, které chtějí jen `navigate`.

| Hook | Konzumenti | Co ho invaliduje |
|---|---|---|
| `useRoutePath()` | `BottomNavigation`, `Link`, `AppShell`, `App` | navigace |
| `useRouteSearchParams()` | Today, Calendar, Chores, Activities, Health, Messages | změna query |
| `useRouterActions()` | 8 komponent, které jen naviguují | nikdy — identita je stabilní po celý život provideru |

`useRouter()` zůstal jako fasáda, ale v produkčním kódu ho už nikdo nepoužívá.

Naměřeno v `routerRenderBoundaries.test.tsx`: změna query parametru nerendruje ani jednoho action-only ani path-only konzumenta; navigace nerendruje konzumenty query parametrů; identita `actions` je napříč navigacemi jediná.

## B. Reminder sync se volal při nesouvisející změně

Tohle byl nejhodnotnější nález vlny.

`draftInputs` mění identitu, kdykoliv emituje **kterákoliv** z osmi zdrojových domén. Memo `drafts` z toho vyrábělo pokaždé nové pole, a efekt pod ním na tom poli závisí — takže přepnutí položky v nákupním seznamu spustilo `sync_member_reminders` **a** kompletní refresh připomínek. Pro změnu, která nemůže ovlivnit jedinou připomínku.

Oprava drží předchozí pole, když je vygenerovaný obsah identický. Závislost efektu tím začne říkat pravdu.

Mutační ověření: po odstranění stabilizace **všechny čtyři testy vyprší na 5 s timeoutu** místo aby jen selhaly — sync volá `refresh()`, ten překreslí providera, ten vyrobí novou identitu draftů a cyklus se točí dál. V produkci je smyčka ohraničená tím, že skutečný `useReminderSources` memoizuje `draftInputs` nad ~14 závislostmi, takže se ustálí — ale každá skutečná změna domény stále stála jeden sync RPC plus refetch.

Dále dostal `ReminderContext` memoizovanou value a vlastní `useReminderSummary()` pro zvonek v hlavičce, který potřebuje dvě čísla z provideru přepočítávaného osmi doménami.

## D. CSS

`src/index.css` mělo 8 300 řádků / 214 kB.

```text
src/styles/tokens.css              (:root, 128 řádků)
src/styles/base.css                (resety a element defaults, 64 řádků)
src/index.css                      (feature styly, @import obou výše)
src/components/messages/messages.css   (172 pravidel → route chunk)
src/features/family-jump/familyJump.css (už dřív vlastní chunk)
```

`@import` na začátku `index.css` je pořadí kaskády — proto tam musí zůstat první.

**Chat do route chunku.** Kompletní chat styly se přesunuly do `messages.css`, kterou importuje `MessagesScreen`. Vite je tak emituje jako CSS route chunku, který se načte až po `index.css` — kaskádová pozice, kterou pravidla měla na konci původního souboru, zůstává.

Výjimka: `.messages-bell`, `.messages-badge` a `.messages-share-*` **zůstaly v main sheetu**. Zvonek je v hlavičce na každé obrazovce a share sheet se otevírá z Nákupů, úkolů a aktivit — kdyby jejich styly odešly do route chunku, byly by nenastylované, dokud by uživatel neotevřel chat.

Extrakci provedl znakový tokenizer, ne řádková heuristika. První pokus řádkovou heuristikou rozsekl víceřádkový komentář vejpůl a build spadl na `Expected identifier in class selector` — proto ta poznámka v kódu.

Kontrola úplnosti proti `git HEAD`: **5 380 deklarací před, 5 380 po**; 1 457 pravidlových bloků před i po.

| Artefakt | Před | Po |
|---|---:|---:|
| main CSS raw | 185 366 B | **158 486 B** |
| main CSS gzip | 43 830 B | **39 304 B** |
| `MessagesScreen.css` | — (v main) | 22 540 B / 4 390 B gzip |
| `FamilyJumpScreen.css` | 15 650 B / 3 620 B gzip | beze změny |

**Co se záměrně nedělalo:** zbytek feature CSS zůstal v `index.css`. Zadání říká „neprováděj big-bang rewrite" a přesouvání dalších bloků je čistá reorganizace s nulovým runtime přínosem a nenulovým rizikem kaskády.

## E. Fonty — měřeno, neměněno

Audit navrhoval přejít na explicitní `latin`/`latin-ext` subsety. Měření to zamítlo dvakrát:

**1. Runtime přínos je nulový.** Browser během celé relace (Dnes → Zprávy → otevřená konverzace) stáhl **5 souborů / 64 kB**, výhradně latin a latin-ext, po váhách podle potřeby. Na samotném Dnes to byly **2 soubory / 22 kB**. Zbylých ~35 assetů v `dist/` si nikdo nevyžádá — `unicode-range` je nepustí. Service worker precachuje jen `/`, manifest a dvě ikony, takže fonty nezatěžují ani instalaci PWA.

**2. Provedení by bylo regresí.** `@fontsource/manrope` má u per-subset stylesheetů (`latin-600.css`, `latin-ext-600.css`) `@font-face` **bez `unicode-range`** — ten nesou pouze agregované soubory (`600.css`, 6 faces, 6 rozsahů). Import obou subsetů by dal jedné rodině a váze dvě nerozsahované face; poslední by vyhrála pro všechny znaky a `latin-ext` neobsahuje základní latinku. Běžný text by z Manrope vypadl úplně.

Místo změny přibyl `fontLoadingContract.test.ts`, který pinuje agregované importy, ověřuje, že každá face má `unicode-range`, a kontroluje pokrytí **všech 30 českých diakritických znaků** proti skutečným rozsahům v balíčku.

Ověřeno v prohlížeči: `příšerně žluťoučký kůň` se vykresluje v Manrope (šířka se liší od fallbacku) a `document.fonts` hlásí 8 načtených faces — 4 váhy × latin/latin-ext.

## F. Budgets

`scripts/check-route-chunks.mjs` nově hlídá:

| Rozpočet | Naměřeno | Limit |
|---|---:|---:|
| main JS raw | 340 040 B | 372 000 B |
| main JS gzip | 100 917 B | 110 000 B |
| eager JS raw | 759 687 B | 800 000 B |
| eager JS gzip | 223 054 B | 232 000 B |
| **main CSS raw** | 158 486 B | **178 000 B** |
| **main CSS gzip** | 39 304 B | **43 000 B** |

Plus nová kontrola, že `familyJump.css` i `messages.css` skutečně patří svému route chunku a nejsou složené do entry stylesheetu. Vite klíčuje emitované CSS podle importující komponenty, takže guard mapuje stylesheet → route komponenta.

## Testy

Nové: `routerRenderBoundaries.test.tsx` (5), `ReminderContext.syncFanout.test.tsx` (4), `cssArchitectureContract.test.ts` (14), `fontLoadingContract.test.ts` (5), rozšířený `bundleGuard.test.ts` (+3).

`cssArchitectureContract` hlídá vrstvení (`@import` pořadí), že tokens jsou čistý blok proměnných, že base drží jen element defaults a sdílené utility, že route sheety jsou **plně class-scoped**, že chat pravidla nejsou v main sheetu kromě těch renderovaných jinde, a **baseline nescopovaných element selektorů** — `index.css` legitimně styluje `button`/`input` v sekcích Buttons a Forms, takže guard hlídá růst, ne existující stav.

Čtyři existující CSS kontrakty (`designSystemDebt`, `appShellLayoutContract`, `iosInputZoomContract`, `messagingChatContract`) četly `src/index.css`. Nově čtou `appStyles()` — konkatenaci v pořadí kaskády, která reprodukuje přesně to, co `index.css` obsahovalo před rozdělením. `familyJump.css` je z ní **záměrně vynechaný**: nikdy pod těmito kontrakty nebyl a jeho zahrnutí vytáhlo nesouvisející starý dluh, což je samostatná práce, ne vedlejší efekt přesouvání souborů.

## Browser QA

Na přihlášené relaci s reálnými daty:

- tokeny se resolvují (`--surface-canvas`, `--font-weight-strong`), Manrope se aplikuje, shell a hlavička nastylované;
- navigace na `/messages` načte šestý stylesheet (route chunk) a `.messages-screen` je `grid`, `.messages-conversation-row` má `14px 16px` padding a paper pozadí;
- `.messages-bubble` má živě `max-width: min(78%, 520px)`, `overflow-wrap: break-word`, radius 18px — tedy přesně to, co pinuje `messagingChatContract`;
- zvonek zůstává nastylovaný před načtením route (42px, `border-radius: 50%`) — potvrzuje, že rozdělení global/route je správně;
- návrat na Dnes: panely, spodní navigace i zvonek připomínek v pořádku, `body` bez marginu → route sheet nepropustil žádné element pravidlo;
- **0 chyb v konzoli.**

## Validace

```
npm run lint                 ✓ (pouze předchozí warningy)
npm test                     ✓ 198 souborů / 1 196 testů
npm run build                ✓ + route chunk guard passed
npm run check:edge-functions ✓
git diff --check             ✓
```

## Záměrně beze změny

Business logika, databázové schema, offline queues, route UX, vizuální design, font setup, zbytek feature CSS v `index.css`.

## Follow-up

- `familyJump.css` není pokrytý design-system kontrakty a obsahuje starší dluh (nedefinované custom properties, levé borders jako status accent). Vlastní úkol, ne součást téhle vlny.
- `useRouter()` fasáda už nemá produkčního konzumenta a dala by se odstranit, až se ustálí testy, které ji mockují.

# Rodinka

**Ať doma všechno klape.**

Rodinka je přehledný rodinný plánovač pro každodenní domluvu. Na jednom místě spojuje kalendář, domácí úkoly, kroužky, návštěvy lékaře, jídelníček, nákupní seznam a připomínky. Je navržená především pro mobil, aby šlo běžné věci vyřídit během několika klepnutí.

[Otevřít Rodinku](https://moje-rodinka.vercel.app)

## Méně domlouvání, více přehledu

Kdo dnes vyzvedává dítě? Co je potřeba koupit? Které úkoly ještě čekají? Kdy je další kontrola u lékaře? Rodinka dává celé domácnosti jeden společný a aktuální pohled — bez dlouhého hledání ve zprávách, poznámkách a několika různých kalendářích.

Každý člen rodiny má vlastní barvu, může mít fotografii a v přehledech se zobrazuje jen tam, kde je to užitečné. Dospělí mohou plánovat a spravovat domácnost, děti mohou plnit své úkoly a historické záznamy zůstávají zachované.

## Co Rodinka umí

### Dnes

Domovská obrazovka ukazuje jen to, co je právě důležité:

- dnešní program a položky vyžadující pozornost,
- rychlé úkoly s možností okamžitého dokončení,
- nákupní seznam a rychlé přidávání více položek za sebou,
- schválení dětských úkolů a další důležité připomínky,
- volitelnou rodinnou fotografii s bezpečným ořezem a čitelným gradientem.

### Rodinný kalendář

- měsíční, týdenní a agenda pohled,
- aktivity, události, úkoly, zdraví a jídla v jednom přehledu,
- filtry podle člena rodiny a typu položky,
- opakované události a samostatné deep linky,
- změna doprovodu nebo přiřazené osoby jen pro jeden konkrétní termín,
- zachování výchozího nastavení celé série i historických výjimek.

### Úkoly domácnosti

Úkol není automaticky „práce za kapesné“. Může jít o běžnou povinnost dospělého, rychlou poznámku nebo dětský úkol s odměnou.

- přiřazení dospělému, dítěti nebo ponechání bez přiřazení,
- jednorázové i opakované úkoly,
- samostatná historie jednotlivých výskytů,
- volitelná odměna a schvalování dospělým,
- rychlé úkoly s vlastním pořadím priorit,
- změna řešitele jednoho opakovaného termínu bez úpravy celé série.

### Aktivity a rodinné události

- kroužky, pravidelné aktivity i jednorázové rodinné události,
- více účastníků a akce „Celá rodina“,
- datum, čas, místo a opakování,
- výchozí i jednorázově změněný dospělý doprovod,
- volitelné kontakty, platby, připomínky, poznámky a další podrobnosti,
- jednoduchý základní formulář s pokročilými poli až na vyžádání.

### Zdraví

- plánované návštěvy, kontroly a očkování,
- pacient a odpovědná osoba,
- termíny dalších kontrol a připomínky,
- přehled minulých i nadcházejících záznamů.

Rodinka není zdravotnický informační systém. Zdravotní modul slouží k rodinnému plánování termínů a návštěv, nikoli k vedení klinické dokumentace.

### Jídla a plánování jídel

- společná knihovna oblíbených jídel,
- týdenní jídelní plán,
- rodinné hlasování o tom, co uvařit,
- přiřazení odpovědnosti za přípravu,
- opakované použití ingrediencí v nákupním seznamu.

### Sdílený nákupní seznam

- rychlé přidávání a slučování stejných položek,
- vlastní názvy a barevné akcenty sekcí,
- přesouvání položek a řazení pomocí drag & drop,
- přiřazení nákupu konkrétnímu členovi,
- historie předchozích nákupů a běžně kupované položky,
- převod ingrediencí z jídel do společného seznamu.

### Připomínky a oznámení

- jedno centrum pro úkoly, aktivity, zdraví, jídla, kapesné a nákupy,
- přečtení, skrytí a historie vyřešených připomínek,
- osobní nastavení kategorií, tichých hodin a souhrnů,
- serverové zpracování a web push po dokončení provozní konfigurace.

### Zprávy

- rodinný chat pro celou domácnost jako výchozí konverzace,
- přímé konverzace mezi dvěma členy rodiny,
- real-time doručení nových zpráv bez obnovení stránky,
- unread počty a označení konverzace jako přečtené při otevření,
- základní seskupení po sobě jdoucích zpráv stejného autora,
- bezpečnostní hranice na úrovni databáze — rodina nikdy nevidí konverzaci jiné rodiny a rodič nevidí přímý chat mezi dvěma sourozenci.

## Rodina podle vás

- vlastní název domácnosti,
- dynamická značka Rodinky složená z barev aktivních členů,
- profilové fotografie s ořezem,
- volitelná fotografie v záhlaví obrazovky Dnes,
- pozvání dalšího dospělého pomocí kódu,
- bezpečné odebrání nebo obnovení člena bez ztráty historických úkolů a událostí.

Odebraní členové se už nenabízejí v nových výběrech, ale jejich jméno a související historie zůstávají čitelné. Odebrání člena z domácnosti nemaže jeho globální uživatelský účet ani přístup k případným jiným rodinám.

## Čeština a angličtina

Rodinka podporuje češtinu (`cs`) a angličtinu (`en`). Jazyk lze kdykoli změnit v Nastavení a změna se projeví okamžitě bez obnovení stránky. Volba se uloží pro další návštěvu; pokud zatím žádná preference neexistuje, aplikace použije jazyk prohlížeče a pro ostatní jazyky zvolí angličtinu.

Datumy, dny, měsíce, množná čísla i systémové texty respektují vybraný jazyk. Vlastní názvy, poznámky a další obsah vytvořený rodinou se automaticky nepřekládají.

## Soukromí a přístup

Každá domácnost je v databázi oddělená. Supabase Row Level Security kontroluje přístup i na backendu, ne pouze v uživatelském rozhraní. Profilové a rodinné fotografie jsou uložené v privátních Storage bucketech a aplikace pro ně vytváří pouze dočasné podepsané adresy.

Role člena určují, kdo může upravovat rodinu, přidělovat úkoly, schvalovat odměny nebo odebírat další členy. Kritické změny používají databázové kontroly a transakční operace, aby po chybě nezůstala domácnost v neúplném stavu.

## Mobilní aplikace bez instalace z obchodu

Rodinka je Progressive Web App. Lze ji používat přímo v prohlížeči nebo přidat na plochu telefonu. Podporuje responzivní mobilní rozhraní, bezpečné okraje zařízení, samostatné spuštění a service worker potřebný pro webová push oznámení.

## Stav projektu

Rodinka je aktivně vyvíjený produkt. Hlavní rodinné workflow je funkční, ale před širším produkčním nasazením je vhodné dokončit vlastní provozní konfiguraci Supabase, OAuth, serverových připomínek, Web Push a zálohování.

Plánovaný další rozvoj zahrnuje zejména externí kalendářové integrace a případný nativní obal pro distribuční obchody. Aktuální technické úkoly a nápady jsou v [roadmapě](./rodinka-roadmap.md).

---

## Pro vývojáře

### Technologie

- **Frontend:** React, TypeScript a Vite
- **Backend:** Supabase — PostgreSQL, Auth, Storage, Edge Functions a Row Level Security
- **Testy:** Vitest
- **Lokalizace:** i18next a react-i18next
- **Nasazení frontendu:** Vercel s fallbackem pro client-side routy
- **Cílová platforma:** mobilní PWA, responzivní web a později případný nativní wrapper

### Lokální spuštění

Požadavky:

- Node.js a npm,
- Supabase projekt,
- Supabase CLI pro správu migrací.

```bash
npm install
cp .env.example .env
```

Do `.env` doplňte:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=
```

`VITE_VAPID_PUBLIC_KEY` je potřeba pouze pro Web Push. Vývojový server spustíte příkazem:

```bash
npm run dev
```

Výchozí lokální adresa je `http://localhost:5173`.

### Databáze a migrace

Databázové změny jsou verzované v `supabase/migrations`. Po prvním propojení projektu používejte CLI:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Migrace nespouštějte opakovaně ručně přes SQL Editor. Supabase CLI eviduje aplikované verze a bezpečně přeskočí ty, které už na vzdálené databázi existují. Pro lokální shadow database vyžaduje některé příkazy spuštěný Docker Desktop; samotné porovnání a push na propojený projekt Docker obvykle nepotřebují.

### Kontroly před odesláním změn

```bash
npm run lint
npm test
npm run build
```

### Struktura aplikace

- `src/components` — obrazovky a znovupoužitelné UI,
- `src/context` a `src/hooks` — sdílená data a operace (viz "Datová vrstva" níže),
- `src/domain` — doménové vstupní typy pro mutace (`ActivityInput`, `MedicalRecordInput`, `ChoreApprovalResult`), oddělené od kontextů,
- `src/utils` — doménová logika, recurrence, projekce kalendáře a formátování,
- `src/notifications` — pravidla připomínek a plánování doručení,
- `src/shopping` — offline-first repozitář nákupního seznamu (IndexedDB, fronta mutací, synchronizace, realtime),
- `src/strings.ts` a `src/i18n` — české a anglické texty,
- `supabase/migrations` — databázové schéma, oprávnění a transakční RPC,
- `supabase/functions` — serverové zpracování připomínek a Web Push.

Kalendář nemá vlastní duplicitní tabulku. Jednotlivé pohledy skládají události z aktivit, úkolů, zdravotních záznamů a jídelního plánu. Opakování a jednorázové výjimky se vyhodnocují ve sdílené doménové vrstvě, aby všechny obrazovky zobrazovaly stejný efektivní stav.

### Datová vrstva: feature kontexty

Aplikace nemá jeden sdílený "god" kontext. Každá doména má vlastní React Context pod `src/context/<oblast>/`, vlastní `loading`/`error` a vlastní `refresh()` — mutace v jedné doméně nepřekresluje obrazovky, které ji nepoužívají, a chyba načtení v jedné doméně neblokuje ostatní.

| Kontext | Hook | Vlastní data |
|---|---|---|
| `family/FamilyCoreContext.tsx` | `useFamilyCore()` | `familyId`, `userId`, `userEmail`, `currentMember`, `isParentOrAdmin` — malé a stabilní, nenačítá žádnou doménová data |
| `family/FamilyMembersContext.tsx` | `useFamilyMembersData()` | členové (aktivní i odebraní), `memberById`, přidání/úprava/odebrání/obnovení člena, pozvánky |
| `family/FamilySettingsContext.tsx` | `useFamilySettings()` | název rodiny, fotografie v záhlaví, nastavení kategorií nákupu |
| `chores/ChoresContext.tsx` | `useChoresData()` | úkoly, dokončení, schvalování, rychlé úkoly a jejich pořadí |
| `chores/AllowanceContext.tsx` | `useAllowanceData()` | kapesné — zůstatky, plány, cykly, výplaty |
| `activities/ActivitiesContext.tsx` | `useActivitiesData()` | kroužky a rodinné události, platby |
| `activities/OccurrenceAssignmentsContext.tsx` | `useOccurrenceAssignmentsData()` | výjimky jednotlivých termínů a historie přiřazení — sdíleno úkoly i aktivitami |
| `health/MedicalContext.tsx` | `useMedicalData()` | zdravotní záznamy včetně očkování |
| `meals/MealsContext.tsx` | `useMealsDataContext()` | jídla, hlasování, jídelní plán |
| `shopping/ShoppingContext.tsx` | `useShopping()` | nákupní seznam — tenká obálka nad offline-first repozitářem v `src/shopping` |
| `messages/MessagesContext.tsx` | `useMessagesData()` | rodinné zprávy — konverzace, členové, zprávy, unread počty, `send_message`/`mark_conversation_read` RPC a realtime pro `conversations`/`conversation_members`/`messages` |

`src/context/AppDataProviders.tsx` tyto providery skládá do jednoho stromu. Až na dvě výjimky (kapesné čerpá ID úkolů od domény úkolů; schválení úkolu smí dobít i žebříček kapesného, viz níže) každý provider potřebuje jen `familyId`/`userId` předané jako prop — providery mezi sebou navzájem neimportují svůj kontext.

Obrazovky si berou jen to, co skutečně vykreslují — např. `ShoppingScreen` používá `useShopping()` + `useFamilyMembersData()`, nikoli úkoly, jídla nebo zdraví. `TodayDashboard` a `CalendarScreen` legitimně kombinují víc domén najednou; místo aby importovaly všechny kontexty přímo, skládají si data přes vlastní kompoziční hooky (`src/components/today/useTodayDashboardData.ts`, `src/components/calendar/useCalendarSources.ts`). `ReminderContext` má obdobný `useReminderSources()` v `src/context/reminders/`.

**Pravidlo pro mezidoménové refreshe:** žádný kontext nevolá "refresh všeho". Jediné dvě výjimky jsou tam, kde to odpovídá skutečné transakci na backendu:
- schválení/dokončení úkolu (`useChoreApprovalActions` v `src/context/chores/`) obnoví úkoly, jejich dokončení *a* žebříček kapesného, protože schvalovací RPC obojí mění zároveň,
- odebrání nebo obnovení člena (`FamilyScreen.tsx`) obnoví i úkoly, aktivity a výjimky termínů, protože RPC přeřazuje jejich přiřazení.

**Pravidlo pro přidání nové domény:** vytvořte `src/context/<oblast>/<Domena>Context.tsx` s vlastním `<Domena>Provider` a `use<Domena>Data()` hookem, zapojte provider do `AppDataProviders.tsx`, a pokud doména potřebuje vstupní typ pro mutaci, dejte ho do `src/domain/<oblast>/types.ts` — ne do samotného kontextu.

### Realtime

Rodinka používá Supabase Realtime jako výchozí způsob, jak se změny jednoho člena rodiny promítnou u ostatních — bez ručního obnovování a bez periodického dotazování serveru. Realtime nenese žádnou byznys logiku, jen doručuje změny; zdrojem pravdy zůstává databáze a RPC funkce, UI se vždy vykresluje z lokálního stavu.

**Vlastnictví.** Žádný globální "realtime manager" neexistuje — každý feature kontext, který data vlastní, si sám otevírá, uzavírá a aplikuje vlastní odběr (viz tabulka výše). Sdílená, doménově neutrální logika žije v `src/realtime/`:

| Soubor | Účel |
|---|---|
| `connectionState.ts` | typ `RealtimeConnectionState` (`connecting`\|`connected`\|`reconnecting`\|`disconnected`) a mapování ze Supabase subscribe statusu |
| `createRealtimeSubscription.ts` | otevře jeden kanál, zaregistruje INSERT/UPDATE/DELETE listenery pro N tabulek, vrátí funkci pro odhlášení |
| `applyRealtimeInsert.ts` / `applyRealtimeUpdate.ts` / `applyRealtimeDelete.ts` | generické `(items, row) => items` operace nad polem entit klíčovaným podle `id` |

**Pojmenování kanálů:** jeden kanál na doménu (ne na tabulku, ne jeden globální), `family:<familyId>:<domena>` — např. `family:<id>:chores`, `family:<id>:activities`, `family:<id>:medical`. Doména vlastnící víc tabulek (úkoly + jejich dokončení, tři tabulky pro výjimky termínů, jídla + plán + hlasování) registruje víc tabulek na tomtéž kanálu.

**Cyklus odběru:** efekt v každém provideru se spouští, jen když `familyId` existuje, a vrací funkci pro `supabase.removeChannel(channel)` — při odhlášení uživatele, přepnutí rodiny nebo odmountování providera se kanál korektně uzavře, žádný nezůstává viset.

**Filtrování na serveru:** kde to tabulka umožňuje (má vlastní `family_id`), používá se `filter: 'family_id=eq.<id>'` — server posílá jen řádky patřící dané rodině. Tabulky bez přímého `family_id` (`chore_completions`, `activity_participants`, `meal_vote_candidates`, `meal_votes` — vázané přes rodičovský řádek) žádný `filter` string nemají; správný rozsah dat i tak hlídá Row Level Security na úrovni SELECT, jen bez dodatečného zúžení stringem. `activity_participants` navíc nemá vlastní `id` (composite primary key `activity_id`+`member_id`), takže se nezapojuje do generických `applyRealtime*` helperů — patchuje přímo `participant_ids` vlastnící aktivity (viz `ActivitiesContext.tsx`). Podobně `meal_vote_candidates`/`meal_votes` patchují vnořenou strukturu `meal_vote_rounds → candidates → votes` (viz `useMealsDataSource.ts`) — vnořovací logika zůstává doménová, ne v generických helperech.

**Deduplikace vs. optimistické update.** Žádná z devíti realtime-zapojených domén dnes nedělá skutečný optimistický insert (mutace vždy zavolá RPC a až pak `refresh()`), takže postačí jednoduchá deduplikace podle `id` v `applyRealtimeInsert` — realtime ozvěna vlastní změny je no-op, protože `id` už v poli je. Nákupní seznam (`src/shopping/`) má vlastní, propracovanější frontu mutací s `mutationId` a offline frontou — realtime tam jen spouští resync (`sync()`), který frontu mutací srovná s čerstvým stavem serveru (`applyPendingShoppingMutations`); to zůstalo beze změny, viz níže.

**Proč nákupní seznam nemá granulární insert/update/delete.** `src/shopping/shoppingRepository.ts` je nejdůkladněji otestovaná část synchronizace a už správně řeší souběh offline fronty mutací se serverovým stavem. Realtime tam funguje jako spouštěč celého resyncu (`family:<id>:shopping` kanál → `sync()`), ne jako per-řádkový patch — přepisovat to na granulární apply by jen znovu odvozovalo stejnou správnost bez přínosu pro už battle-tested systém.

**Proč `ReminderContext` neztratil polling úplně.** 15minutový `REMINDER_FOREGROUND_REFRESH_MS` interval a `visibilitychange`/`online` resync zůstávají — mobilní prohlížeče běžně uspávají WebSocket spojení na pozadí, takže polling slouží jako záložní síť, ne jako primární cesta (tou je teď realtime). Cross-tab `localStorage` invalidace v `src/notifications/reminderLifecycle.ts` ztratila druh `'sources'` (byl nadbytečný — každý tab má teď vlastní realtime odběry na stejných doménách), ale `'state'` (přečteno/odloženo) a `'preferences'` zůstaly: připomínky a `notification_preferences` nejsou realtime tabulky z výše uvedeného seznamu, takže mezi taby pořád potřebují signál přes `localStorage`.

**Stav spojení.** Každý zapojený kontext vystavuje `<domena>RealtimeStatus: RealtimeConnectionState`. `src/hooks/useRealtimeStatus.ts` je vybere všechny a vrátí ten nejhorší; `RealtimeStatusBadge` (`src/components/ui/`) ho zobrazuje v hlavičce aplikace — ale jen když není `connected`/`connecting`, takže za normálního provozu nic vidět není (žádné rušivé notifikace).

**Obnova po výpadku.** `createRealtimeSubscription` sám o sobě nic nezkouší znovu — spoléhá na to, že `@supabase/realtime-js` se po výpadku spojení sám přihlásí zpět; wrapper jen mapuje stavové callbacky na `RealtimeConnectionState` a nikdy při výpadku nemaže lokální data, takže obnova je tichá a bez ztráty rozpracovaného stavu.

## Provozní dokumentace

- [Nastavení Supabase Auth a Google OAuth](./supabase-auth-setup.md)
- [Serverové zpracování připomínek](./supabase-reminder-processing.md)
- [Nasazení a provoz Web Push](./supabase-web-push.md)
- [Push oznámení pro zprávy](./supabase-messaging-push.md)
- [Lokalizace a přidávání překladů](./I18N.md)
- [Vizuální identita](./visual-identity.md)
- [Produktová a technická roadmapa](./rodinka-roadmap.md)

## Destructive-action model

Rodinka uses domain-specific destructive actions instead of treating every removal as a permanent delete. New feature work should use the shared destructive UI primitives and route changes through the domain repository or context API rather than calling Supabase directly from React components.

| Domain | Active removal | Historical behavior | Restore | Undo |
| --- | --- | --- | --- | --- |
| Shopping item | Offline-safe queued delete/tombstone via the shopping repository | Removed from active list; stale sync updates must not resurrect it | Add/update through a later mutation when supported | Yes, delayed commit from the UI |
| Purchased shopping history | Archive purchased items | Previous-shop history remains readable | No direct UI restore | No |
| Chore | Archive the chore | Completion history, approved rewards, and allowance ledger entries remain | Yes | No |
| Chore occurrence | Recurrence exception for one occurrence; future split when supported | Past completions remain readable | Permission-based | No |
| Activity / club | Archive or cancel the series/occurrence | Participants, responsible parent, payment, and reminder history remain | Permission-based | No |
| Family event | Cancel future one-off event | Past events remain visible as history | Permission-based | No |
| Medical record / vaccination | Cancel planned appointment; archive incorrect records | Completed medical history is preserved by default | Permission-based | No |
| Meal library item | Archive meal from reusable library | Meal-plan, vote, and shopping references keep their titles | Yes | No |
| Meal plan entry | Remove only the plan entry | Meal library item and generated shopping items remain | Re-add entry | Yes when not historical |
| Meal vote round | Delete draft, cancel open, archive closed | Vote history remains meaningful for closed rounds | Permission-based | No |
| Quick task | Remove from active quick list | No required history | Re-create | Yes |
| System reminder | Dismiss/resolve | Reminder history is retained | No | No |
| Family member | Existing safe household-member removal workflow | Historical references, reassignment choices, roles, and last-admin protection remain | Yes, via household workflow | No |
| Family hero image / member avatar | Clear image path and clean Storage | UI falls back to default/generated image; cleanup failures are logged without exposing content | Re-upload | Yes where rollback is practical |

### Implementation rules for future destructive actions

- **Hard delete** only disposable data that has no audit, synchronization, or historical references.
- **Archive** reusable domain objects that should disappear from new selections while old references stay meaningful.
- **Cancel** scheduled future events or appointments that should remain understandable in history.
- **Occurrence exceptions** are preferred over rewriting a recurring base series for single-occurrence removal.
- **Undo** must be real: delay the commit or use a reversible soft-delete/restore operation. Never show Undo after an irreversible hard delete.
- Shared components live in `src/components/ui/DestructiveActions.tsx`: `DestructiveIconButton`, `ConfirmDestructiveActionDialog`, `RecurringDeleteScopeDialog`, `UndoToast`, and `ArchivedItemBadge`.

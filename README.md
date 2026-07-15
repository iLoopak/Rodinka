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
- `src/context` a `src/hooks` — sdílená data a operace,
- `src/utils` — doménová logika, recurrence, projekce kalendáře a formátování,
- `src/notifications` — pravidla připomínek a plánování doručení,
- `src/strings.ts` a `src/i18n` — české a anglické texty,
- `supabase/migrations` — databázové schéma, oprávnění a transakční RPC,
- `supabase/functions` — serverové zpracování připomínek a Web Push.

Kalendář nemá vlastní duplicitní tabulku. Jednotlivé pohledy skládají události z aktivit, úkolů, zdravotních záznamů a jídelního plánu. Opakování a jednorázové výjimky se vyhodnocují ve sdílené doménové vrstvě, aby všechny obrazovky zobrazovaly stejný efektivní stav.

## Provozní dokumentace

- [Nastavení Supabase Auth a Google OAuth](./supabase-auth-setup.md)
- [Serverové zpracování připomínek](./supabase-reminder-processing.md)
- [Nasazení a provoz Web Push](./supabase-web-push.md)
- [Lokalizace a přidávání překladů](./I18N.md)
- [Vizuální identita](./visual-identity.md)
- [Produktová a technická roadmapa](./rodinka-roadmap.md)

# Audit "Přidat" akcí napříč aplikací

Datum: 2026-07-21
Základ: `main` @ `d1873f7`
Metoda: statická analýza `src` (žádné běžící prostředí s reálnými daty po ruce pro tenhle běh) — každé místo níže je ověřeno přímo v kódu, ne odhadnuté.

Návaznost: doplňuje [`DESIGN_SYSTEM_UX_CONSISTENCY_AUDIT.md`](./DESIGN_SYSTEM_UX_CONSISTENCY_AUDIT.md) a [Design Wave 1](../implementation/DESIGN_WAVE_1_HEADERS_TOOLBARS_FILTERS.md), které už zavedly `Button`/`IconButton` a migrovaly hlavičkové akce na 11 obrazovkách. Tenhle audit se ptá užší otázku: **kolik různých vzhledů má "vytvořit nový záznam" po celé aplikaci** a odstraňuje zbytek.

---

## Souhrn

Žádný globální FAB neexistuje — ověřeno (`fab`/`Fab`/`.plus-btn`/`.floating` nikde v `src/styles`). Každá "přidat" akce je vlastní obrazovce/sekci. Většina tvůrčích cest (úkol, aktivita, lékař, jídlo, knihovna jídel, hlasování, nákup) jde přes jeden `useCreateRecord().openCreateRecord(...)` a `CreateRecordWizard`. Mimo tenhle wizard existují samostatné add-cesty pro člena rodiny, chat, kapesné a dětský účet.

Nález: **9 skutečně odlišných vizuálních zápisů** stejného záměru "přidej nový záznam":

| # | Zápis | Kde | Vzhled |
| - | --- | --- | --- |
| 1 | `<Button variant="primary" leadingIcon="+">` | Kalendář (Dnes vedle), Úkoly, Aktivity, Zdraví, Nákupy, Knihovna jídel, Plán jídel, Hlasování, Rodina (přidat dítě) | ✅ sdílený, správně |
| 2 | `<IconButton variant="primary">+</IconButton>` | Kalendář — hlavička (icon-only) | ✅ sdílený, správně |
| 3 | `<Button variant="primary" leadingIcon="+" className="planner-create-button">` | Plánovač | ❌ vlastní CSS ho barvou i stínem přebarvovalo na sekundární vzhled — vypadal jinak než všude jinde přesto, že `variant="primary"` |
| 4 | `<button className="hero-action-button">+ Přidat</button>` | Dnes — hero nad fotkou rodiny | ❌ **kulaté FAB** — `border-radius: 999px`, barevný stín |
| 5 | `<button className="link today-program-empty-action">+ Přidat</button>` | Dnes — prázdný program | ❌ pouze textový odkaz, žádná výplň |
| 6 | `<button className="btn-secondary messages-new-button">Nová konverzace</button>` | Chat — hlavička | ❌ sekundární barva a bez "+" ikony pro tvůrčí akci |
| 7 | `<button className="btn-secondary">+ label</button>` (×3) | Rodina → profil člena → "Naplánovat pro …" | ❌ sekundární barva místo primární |
| 8 | `EmptyState`'s vestavěné `<button className="btn-secondary">` | Knihovna jídel (prázdný stav), Hlasování (prázdný stav), Chat (prázdná konverzace) | ❌ tentýž komponent používaný jak pro "vytvoř první záznam", tak pro "zkusit znovu"/"vyčistit filtry" — nerozlišeno, obojí sekundární |
| 9 | `+ Přidat další jídlo` / per-day inline odkazy, ingredience v receptu | Plán jídel (řádek dne), detail receptu | ponecháno — řádková/vnořená afordance, ne "jak vytvořit záznam na téhle obrazovce"; viz níže |

---

## Screeny podle briefu

| Obrazovka | Hlavní "Přidat" | Stav před | Stav po |
| --- | --- | --- | --- |
| Kalendář | hlavička, icon-only "+" | ✅ `IconButton` | přejmenováno na `AddActionIcon` |
| Úkoly | hlavička, "+ Přidat úkol" | ✅ `Button` | přejmenováno na `AppToolbarAddButton` |
| Připomínky | — | žádná create akce (jen systémová oznámení: přečíst/zavřít) | beze změny |
| Jídla → Plán | tab-toolbar, "+ Naplánovat jídlo" | ✅ `Button` | `AppToolbarAddButton` |
| Jídla → Knihovna | hlavička + prázdný stav | hlavička ✅, prázdný stav ❌ btn-secondary | hlavička `AppToolbarAddButton`, prázdný stav `EmptyState variant="primary"` |
| Jídla → Hlasování | tab-toolbar + prázdný stav | stejný nález jako Knihovna | stejná oprava |
| Nákupní seznam | hlavička, "+ Přidat" | ✅ `Button` | `AppToolbarAddButton` (rychlé přidání v inline formuláři beze změny — jiný vzor, viz níže) |
| Chat | hlavička, "Nová konverzace" | ❌ `btn-secondary`, bez "+" | `AppToolbarAddButton`; prázdná konverzace `EmptyState variant="primary"` |
| Rodina | hlavička "+ Přidat dítě" + `+ label` shortcuty v profilu člena | hlavička ✅, shortcuty ❌ `btn-secondary` | hlavička `AppToolbarAddButton`; 3 shortcuty → `AppToolbarAddButton` |
| Děti | (součást Rodiny — profil, účet) | založení dětského účtu je provisioning, ne datový záznam | ponecháno (viz níže) |
| Kapesné | — | žádná "přidat transakci" — jen Nastavit/Spravovat plán a Vyplatit/Přeskočit | beze změny (jiný typ akce) |
| Herna | — | žádná create akce (výběr her) | beze změny |
| Dnes (Home) | hero CTA + prázdný program | ❌ kulaté FAB + ❌ text link | oba `AppPrimaryAddButton` |
| Plánovač (přehled) | hlavička "+ Přidat" | ❌ přebarveno na sekundární | `AppToolbarAddButton`, CSS override smazán |
| Zdraví | hlavička | ✅ `Button` | `AppToolbarAddButton` |
| Aktivity | hlavička | ✅ `Button` | `AppToolbarAddButton` |

---

## Co zůstává mimo rozsah a proč

- **Rychlá pole** (`TodayQuickAddField` na Dnes pro úkoly/nákupy, inline `shopping-quick-add`) — to je jiný UI vzor: textové pole s vlastním submit tlačítkem ("napiš a stiskni +"), ne samostatné tlačítko vedle nadpisu. Sjednocení by je muselo proměnit na "otevři dialog", což by změnilo chování, ne jen vzhled.
- **Řádkové/vnořené "přidat" odkazy** — kalendářní "+ Přidat na tento den" v denní kartě, "+ Přidat další jídlo" v `PlanTab`, "Přidat do hlasování/plánu" v detailu receptu, přidání ingredience v `MealIngredientsSection`. Tohle jsou desítky opakujících se řádků (např. každý den v měsíci); přebarvit každý na plné primární tlačítko by obrazovku vizuálně přetížilo a je to jiný typ afordance než "jak založím nový záznam na téhle obrazovce" — to je vždy ta jedna hlavičková/CTA akce výš.
- **Pozvat rodiče** (`FamilyScreen`) — vytváří pozvánku, ne datový záznam; zůstává sekundární akcí vedle "Přidat dítě", ne duplicitní CTA.
- **Založení dětského účtu** (`ChildAccountSection`) — provisioning přihlašovacích údajů, žije mezi Reset/Odvolat jako jedna skupina účtových akcí, ne "přidej záznam".
- **Odeslat zprávu** / **připojit obsah** v Composeru — odeslání zprávy má vlastní odesílací tlačítko (šipka), "+" u composeru otevírá menu přílohy/sdílení existujícího, ne založení nového záznamu tímtéž vzorem.

Tahle hranice je vědomá: dvě varianty z briefu (Primary Action, Toolbar Action) popisují **tu jednu cestu, jak založit záznam na obrazovce/v sekci** — ne každý vedlejší "přidat řádek" uvnitř existujícího obsahu.

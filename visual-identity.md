# Vizuální identita Rodinky

## Implementovaný základ aplikace (Wave 1)

Rodinka je teplý, klidný a spolehlivý rodinný nástroj. Rozhraní má být přátelské bez infantilnosti, výrazné bez dekorativního hluku a dostatečně husté pro každodenní práci. Marketingový web je barevná inspirace, nikoli předloha rozložení produktu.

### Sémantické role barev

Zdrojová paleta používá teplé plátno `#F7F2E8`, papír `#FFFDF8`, tmavý inkoust `#243128`, tlumený inkoust `#667068`, korál `#E9785E`, medovou `#F2C85B`, mátovou `#8BC6AD` a jemnou modrou `#8DB9C7`. V kódu se však komponenty opírají o sémantické tokeny:

- `--surface-*` určuje plátno, papír, jemnou a vyvýšenou plochu;
- `--text-*` určuje hlavní, tlumený a jemný text;
- `--interactive-*` určuje primární akci a její hover/pressed stavy; pro bílé písmo používá tmavší, kontrastní variantu korálu;
- `--state-danger|warning|success|info|offline` a jejich `-soft` varianty označují systémové stavy;
- `--border-*`, `--focus-ring`, `--radius-*`, `--shadow-*` a `--motion-*` vlastní společné chování komponent.

Historické tokeny (`--ink`, `--paper`, `--brick`, `--radius-card` a další) jsou pouze dokumentované kompatibilní aliasy. Sémantická vrstva je vlastníkem nového systému; nové komponenty nemají zavádět další paralelní paletu.

### Moduly a členové rodiny

Modulové akcenty (`--accent-*` a `--category-*`) označují typ obsahu. Používají se na ikonách, malých badge, tenkých hranách a jemných výplních, nikoli jako soutěžící velké barevné plochy.

Členské barvy jsou samostatná sada `--member-*`. Objevují se pouze u avataru, přiřazení a rodinné značky. Uložené klíče `brick`, `coral`, `sky`, `sage`, `honey`, `lavender`, `berry` zůstávají platné a deterministické; změnila se jen jejich vizuální interpretace, takže není nutná migrace dat.

### Typografie, tvary a vrstvy

Manrope zůstává jediným písmem pro značku, nadpisy i běžný text. Řezy 500–800 jsou zabalené přímo s aplikací a nevyžadují Google Fonts za běhu. Formulářové prvky zůstávají minimálně `16px`, aby se na iOS nezvětšoval viewport. Tituly obrazovek jsou kompaktní; marketingové velikosti do aplikace nepatří.

Malý, střední a velký radius reprezentují ovládací prvek, řádek a kartu/sheet. Nízký stín jemně odděluje kartu od plátna, vyvýšený stín patří pouze modalu, sheetu, navigaci nebo toastu. Stín není dekorace každé karty.

### Hierarchie komponent a přístupnost

Primární tlačítko nese hlavní akci, sekundární je papírové s hranou, ghost je pro podpůrné akce, icon-only má vždy popisek a nejméně `44×44px`, destruktivní používá vlastní nebezpečnou roli. Disabled stav nesmí být jedinou informací a focus ring musí zůstat zřetelný na všech plochách.

Prázdný stav se smí zobrazit až po úspěšném načtení. Loading, error, offline, success a synchronizační varování mají textový popis a nespoléhají jen na barvu. Text a interaktivní prvky musí dosahovat WCAG AA; jemný korál je určen pro dekoraci a měkké výplně, nikoli pro bílý text na tlačítku.

### Expresivní motivy

Organické dílky mozaiky, jemné barevné oblouky a měkké gradienty jsou vhodné pro přihlášení, onboarding, hero plochu a prázdné stavy. Nevhodné jsou pro funkční seznamy: žádné náhodně natočené karty, obří marketingové nadpisy, dekorativní překážky, emoji jako funkční ikony ani trvalé animace. Pohyb má trvat přibližně 140–260 ms, vysvětlovat změnu stavu a respektovat `prefers-reduced-motion`.

## Konsolidace aplikace (Waves 2–5)

Pozdější vlny rozšířily základ Wave 1 bez změny vizuálního směru:

- autentizovaná aplikace používá stabilní shell s jedním scrollovatelným `<main>`, bezpečnými okraji a spodní navigací; jednotlivé routy nesmějí zavádět body-level scroll ani horizontální přetečení;
- obrazovky používají společnou hierarchii `ScreenHeader`, jednu primární akci, `ScrollableTabs` pro delší sady záložek a `FilterDisclosure` pro sekundární filtry;
- husté pracovní seznamy jsou seskupené papírové plochy s oddělovači. Samostatný stín patří pouze skutečně vyvýšené kartě, modalu, navigaci nebo toastu;
- identita osoby je sdílená struktura avatar + jméno + role. Pokud má jedna osoba více rolí, zobrazuje se jednou s více popisky; členské barvy zůstávají oddělené od modulových akcentů;
- všechny modaly mají programový název, volitelný popis, uzavřený focus order, topmost `Escape` a návrat fokusu na spouštěč. Destruktivní potvrzení začíná bezpečnou akcí a pojmenovává konkrétní dopad;
- loading, skutečně prázdný stav, filtrovaný prázdný stav, offline data, probíhající synchronizace a chyba jsou samostatné stavy. Retry zobrazuje průběh a nepovoluje duplicitní požadavek;
- autentizace a onboarding používají stejnou značku, typografii a formulářové prvky. Backendové a providerové chyby se nikdy nevykreslují přímo;
- funkční ikony pocházejí z jedné linkové sady. Textové glyfy a emoji zůstávají pouze uživatelským nebo dekorativním obsahem;
- `prefers-reduced-motion` vypíná nepodstatné animace, nikoli textovou nebo stavovou zpětnou vazbu.

### Záměrně ponechané výjimky

- barvy čtyř částí Google loga v OAuth tlačítku jsou vlastnictvím poskytovatele, ne paralelní paleta Rodinky;
- `--area-accent`, `--week-entry-accent` a `--week-entry-surface` jsou lokální CSS custom properties předávané komponentou podle typu záznamu. Nejde o chybějící globální tokeny;
- historické aliasy zůstávají kompatibilní API pro starší selektory. Nový kód používá sémantické tokeny a ověřovací test hlídá nedefinované globální proměnné.

## Doporučený směr: **Rodinná mozaika**

Rodinka by neměla vypadat ani jako korporátní productivity nástroj, ani jako přeslazená „aplikace pro maminky“.

Cílový pocit:

> **Teplý, klidný a přehledný rodinný operační systém.**

Přívětivý pro děti, ale vytvořený primárně pro dospělé. Barevný, ale ne duhový. Hravý, ale ne infantilní.

---

## Základní principy

### Přátelská, ne dětská

Používat měkké tvary, příjemné barvy a lidský jazyk, ale vyhnout se kresleným zvířátkům, infantilním fontům a přemíře emoji.

### Klid uprostřed domácího chaosu

Rozhraní by mělo působit vzdušně. Ne dashboard plný dvaceti widgetů, ale několik jasných odpovědí:

* Co nás dnes čeká?
* Kdo má co udělat?
* Je potřeba něco vyřešit?
* Co bude k jídlu?

### Rodina jako celek i jednotlivci

Každý člen rodiny může mít vlastní barvu a avatar, ale samotná aplikace musí mít jednu silnou společnou identitu.

### Radost z hotových věcí

Dokončení úkolu, schválení kapesného nebo sestavení jídelníčku může mít lehký příjemný pohyb. Zdravotní a organizační části zůstávají věcné a klidné.

---

# Logo

## Symbol: mozaika společného domova

Znak by tvořily **čtyři měkké, mírně nepravidelné dílky**, které společně vytvářejí kompaktní tvar připomínající současně:

* malý domek,
* květ,
* několik lidí seskupených kolem společného středu.

Jednotlivé dílky představují členy rodiny. Samostatně jsou odlišné, dohromady tvoří jeden celek.

Ve středu může vznikat malé negativní místo ve tvaru zaobleného kosočtverce nebo velmi nenápadného srdce. Srdce ale nesmí být prvoplánové.

### Výhody tohoto znaku

* funguje jako malá ikona PWA,
* lze jej snadno animovat při spuštění,
* jednotlivé části lze použít jako grafický motiv,
* není závislý na konkrétním počtu členů rodiny,
* nevypadá jako další generický domeček s lidmi.

## Wordmark

Používal bych především podobu:

**rodinka**

Malými písmeny, s vlastní mírně upravenou kresbou. Kulatá písmena, ale žádný bubble font. Tečka nad `i` může používat korálovou nebo členskou barvu.

V běžném textu zůstává název **Rodinka**.

---

# Barevný systém

## Základ aplikace

| Role          | Barva     | Použití                       |
| ------------- | --------- | ----------------------------- |
| Ink           | `#26323A` | hlavní text, navigace         |
| Warm canvas   | `#FFF8F2` | hlavní pozadí                 |
| Paper         | `#FFFFFF` | karty, sheets, formuláře      |
| Soft border   | `#E8DED4` | oddělení ploch                |
| Primary brick | `#B94742` | hlavní tlačítka, aktivní stav |
| Living coral  | `#E96C62` | logo, dekorace, zvýraznění    |

Hlavní identifikační barvou by tedy nebyla růžová, ale **teplá korálově cihlová**. Je lidská a domácí, ale stále dostatečně dospělá.

## Modulové akcenty

| Oblast              | Akcent             |
| ------------------- | ------------------ |
| Aktivity a kalendář | Sky `#6F9ED6`      |
| Domácí úkoly        | Sage `#76A98B`     |
| Jídlo               | Honey `#E8B84B`    |
| Kapesné             | Lavender `#9683C4` |
| Zdraví              | Berry `#C45D70`    |

Tyto barvy nepoužívat jako velké barevné bloky. Spíš jako ikonku, tenký proužek, badge, datum nebo jemně tónované pozadí.

**Barva modulu a barva člena rodiny musí být dva oddělené systémy.** Členská barva se objeví jen u avataru, přiřazení nebo drobného kruhu kolem fotografie.

---

# Typografie

## Primární font: Manrope

Jedna rodina fontů pro celou aplikaci:

* dobře čitelná na mobilu,
* moderní, ale ne sterilní,
* lehce zaoblená,
* funguje s českou diakritikou,
* zvládá nadpisy, běžný text i čísla.

Doporučené řezy:

* 700 pro hlavní názvy,
* 600 pro nadpisy karet a tlačítka,
* 450–500 pro běžné texty,
* tabulární číslice pro časy, peníze a kalendář.

Nadpisy by neměly být obří. Rodinka má působit jako každodenní nástroj, ne marketingový web.

---

# Tvary a komponenty

## Karty

* radius přibližně `18px`,
* tenký teplý border,
* minimální nebo žádný stín,
* více vnitřního prostoru,
* barevnost spíš uvnitř obsahu než na celé kartě.

## Tlačítka

Primární tlačítko:

* tmavší cihlová,
* bílé písmo,
* výška alespoň 48 px,
* radius 14–16 px.

Sekundární tlačítka mohou být světlá s borderem. Textové odkazy nepoužívat pro důležité akce.

## Ikony

Jednoduché linkové ikony:

* zaoblené konce,
* konzistentní síla přibližně 2 px,
* bez kombinování několika různých knihoven,
* vyplněná varianta pouze pro aktivní navigaci a zásadní stavy.

Emoji lze používat jako volitelný obsah uživatele, ne jako základ design systému.

---

# Grafický motiv

Z jednotlivých dílků loga může vzniknout jednoduchý „rodinný pattern“:

* malé organické kapsle,
* tečky a měkké oblouky,
* velmi světlé pozadí loginu a onboardingu,
* dekorativní prvky prázdných stavů.

Ilustrace by měly připomínat **vystřižené barevné papíry nebo měkké prostorové tvary**. Žádné generické fotografie usmívajících se rodin a žádné detailní kreslené postavičky.

---

# Pohyb

Pohyb má podporovat pocit, že věci doma zapadají na své místo.

* Dílky loga se při startu lehce složí dohromady.
* Nový úkol se jemně zasune do seznamu.
* Dokončená položka se stáhne a změní na klidný hotový stav.
* Přepnutí dne může mít horizontální posun.
* Mikroanimace přibližně 180–260 ms.

Bez neustálého pohupování, gradientních blobů a konfety při každém kliknutí.

---

# Doporučený charakter hlavní obrazovky

Namísto klasického SaaS dashboardu bych použil titul:

## Dnes u nás

Pod ním jedna společná chronologická plocha:

* ranní a odpolední události,
* úkoly členů rodiny,
* důležitá připomínka,
* dnešní jídlo.

Následovat mohou menší sekce:

* **Je potřeba zařídit**
* **Tento týden**
* **Jak jsme na tom**

Rodinka by tak působila jako živý obraz dne, nikoliv jako menu modulů.

---

# Jazyk značky

Rodinka může komunikovat civilně a lehce osobně:

* „Dnes u vás“
* „Ještě zbývá“
* „Máte hotovo“
* „Kdo se toho ujme?“
* „Přidat do rodinného plánu“

Vyhnout se formulacím typu:

* „Správa rodinných zdrojů“
* „Produktivita domácnosti“
* „Optimalizujte svůj rodinný život“

## Možné claimy

**Ať doma všechno klape.**

Alternativně:

**Všechno důležité pro vaši rodinu.**

První varianta je osobitější a značce sedí lépe.

---

# Co bych explicitně nedělal

* pastelově růžovou „mom app“,
* pět zářivých barev na každé obrazovce,
* logo domečku se siluetou rodičů a dětí,
* dětský ručně psaný font,
* skleněné karty a výrazné gradienty,
* příliš technologickou modrofialovou identitu,
* dashboard připomínající firemní task manager.

Výsledkem má být aplikace, která působí **domácky, ale spolehlivě**. Něco, co otevře rodič kvůli lékaři, dítě kvůli úkolu a oba budou mít pocit, že patří do stejného prostoru.

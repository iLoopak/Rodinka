# Vizuální identita Rodinky

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

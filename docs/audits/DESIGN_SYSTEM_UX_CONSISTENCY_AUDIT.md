# Rodinka — audit design systému, CSS a UX konzistence

Datum: 2026-07-20
Základ: `main` @ `fe64902`
Metoda: měření běžící aplikace (dev server, přihlášená rodina s reálnými daty) + statická analýza CSS

---

## 0. Jak tento audit vznikl a co v něm chybí

**Zásadní omezení, které je potřeba přiznat hned:** v tomto prostředí **nefungují screenshoty**. Renderer odpovídá na JS i čtení DOM, ale každé volání `screenshot` i `zoom` spadne na 30s timeout — ověřeno opakovaně, i po zmrazení všech animací (`document.getAnimations()` → 0).

Co to znamená:

| Co brief požaduje | Stav |
| --- | --- |
| Projít skutečné obrazovky, ne jen CSS | ✅ prošel jsem 12 rout v běžící aplikaci s reálnými daty |
| Změřit chování na viewportech | ✅ 390×844 a 320×568 |
| **Vizuální posouzení** | ❌ **neproběhlo** — žádný snímek |

Všechna čísla níže jsou naměřená z DOM běžící aplikace (`getBoundingClientRect`, `getComputedStyle`), ne odhadnutá ze zdrojáku. Ale **estetický soud v tomto auditu není** a nemá předstírat, že je. Věci jako „působí tenhle header vyváženě", „sedí k sobě tyhle dva odstíny", „je ten rytmus mezi sekcemi správný" musí posoudit člověk.

Doporučení: ber to jako audit **měřitelných kontraktů**, a vizuální průchod udělej sám nebo v prostředí, kde snímky fungují.

---

## 1. Screen header contract

Naměřeno na 12 routách:

| Route | Wrapper | `h1` třída | `h1` velikost |
| --- | --- | --- | --- |
| `/` | **žádný** | `home-title` | **23 px** |
| `/plan` | `screen-header` | `home-title` | 25 px |
| `/calendar`, `/chores`, `/activities`, `/health`, `/meals`, `/family`, `/messages`, `/more` | `screen-header feature-screen-header` | `home-title` | 25 px |
| `/shopping` | `… shopping-header` | `home-title` | 25 px |
| `/reminders` | `… reminder-center-header` | `home-title` | 25 px |

Tři nálezy:

**D1-1 (P1) — `home-title` je název, který nesedí.** Používá ho `h1` na **všech** obrazovkách, nejen na Home. Kdokoli bude příště ladit typografii Home, sáhne na třídu, která ovlivní celou aplikaci.

**D1-2 (P1) — Home nemá header wrapper.** Jediná obrazovka bez `.screen-header`, a jediná s jinou velikostí nadpisu (23 vs 25 px). Buď je Home záměrná výjimka — pak to má být pojmenované — nebo je to drift.

**D1-3 (P2) — `screen-header` má tři úrovně modifikátorů.** `screen-header` → `+ feature-screen-header` → `+ shopping-header` / `+ reminder-center-header`. `/plan` má jen základní variantu bez `feature-`, což je pravděpodobně nedopatření.

---

## 2. Toolbar a button hierarchy

**23 tříd** v `index.css`, které definují něco tlačítkového:

```
.btn-icon-plain .danger-link .destructive-confirm-button .destructive-icon-button
.google-button .guided-disclosure-button .header-action-button .header-icon-button
.hero-action-button .planner-area-link .planner-create-button .profile-avatar-button
.row-link .section-footer-link .share-link-action .sign-out-button .tab-button
.vote-button …
```

Naměřené kombinace v běžící aplikaci ukazují, kolik různých zápisů má **stejný záměr**:

| Záměr | Zápisy nalezené na obrazovkách |
| --- | --- |
| sekundární akce | `btn-secondary`, `header-action-button`, `header-action-button btn-secondary`, `btn-link` |
| destruktivní | `link danger-action`, `btn-link destructive-link`, `.danger-link`, `.destructive-confirm-button` |
| ikonové | `header-icon-button`, `.btn-icon-plain`, `.destructive-icon-button`, `.profile-avatar-button` |

**D2-1 (P1) — čtyři způsoby, jak napsat sekundární tlačítko.** Bez jedné varianty (`variant="secondary"`) nemá nová obrazovka jak zjistit, který zápis je ten správný.

**D2-2 (P1) — `header-action-button btn-secondary` kombinuje dvě definice.** Layout a vzhled se míchají v jednom atributu; změna `btn-secondary` tak nechtěně hne headerem.

---

## 3. Tap targets — naměřené hodnoty

Vše měřeno na živých obrazovkách. iOS HIG minimum je 44 × 44 pt.

| Prvek | Rozměr | Vynucené kým | Kde |
| --- | --- | --- | --- |
| `btn-secondary` | 44 × **40** | `.month-nav button.btn-secondary` → `min-height: 40px` | `/calendar`, `/meals` |
| `btn-secondary messages-new-button` | 288 × **40** | lokální `min-height: 40px` | `/messages` |
| `list-drag-handle` | **32** × 68 | vlastní `min-width: 32px` | `/shopping`, 6× |
| `link` | **37** × 44 | `min-width: auto`, šířka od obsahu | `/reminders` |
| `month-grid-day` | **39** × 54 | dělení šířky sedmi | `/calendar` @ 320 |

**D3-1 (P0) — sdílená tlačítka podtékají 44 px kvůli lokálním overridům.** Základní `button` má `min-height: 48px` a to je správně. Problém je, že tři různá místa to lokálně **snižují** pod hmatový limit, a nic to nezachytí:

```css
.month-nav button.btn-secondary { min-height: 40px }   /* calendar, meals */
.messages-new-button            { min-height: 40px }   /* messages */
.list-drag-handle               { min-width: 32px }    /* shopping */
```

To je horší nález než „výchozí tlačítko je malé": výchozí tlačítko je v pořádku a **rozbíjí ho až lokální CSS**, takže se to bude opakovat pokaždé, když někdo bude ladit konkrétní obrazovku.

**D3-2 (P1) — `link` v reminder-actions je 37 px široký**, protože `min-width` zůstává `auto` a šířku určuje text.

**D3-3 (P2) — `month-grid-day` 39 px na 320px viewportu.** Vyplývá z dělení šířky sedmi; řešitelné až se změnou mřížky.

---

## 4. Horizontal overflow

Naměřeno: **`document.scrollWidth - clientWidth === 0` na všech routách a obou viewportech.** Tělo stránky nikde neroluje do strany — to je dobrý výchozí stav a vlny ho nesmí rozbít.

Dva prvky ale přesahují viewport uvnitř svého kontejneru:

**D4-1 (P2) — `tab-button` přesahuje** na `/chores` (do 451 px při 320 viewportu), `/activities` (410), `/health` (429). Jde o rolovací pruh záložek; je potřeba potvrdit, že je to záměr a že má viditelnou afordanci rolování.

**D4-2 (P2) — `allowance-summary-line` přesahuje** na `/more` při 320 px (do 331 px).

---

## 5. Co je v pořádku a vlny to nemají „opravovat"

Explicitně, aby se to omylem nepřepsalo:

- **Žádný horizontální scroll dokumentu** na žádné routě ani viewportu.
- **Inputy jsou ≥ 16 px** (naměřeno 17 a 16 px v Create Record wizardu) — iOS nezoomuje. Hlídá to už `iosInputZoomContract.test.ts`.
- **Modal má `role="dialog"` a `aria-modal="true"`**, backdrop `z-index: 102` nad bottom nav (10).
- **`main` má konzistentní `padding-bottom: 102px`** na všech routách — bottom nav nic nepřekrývá.
- **CSS architektura je zdravější, než by 7 000 řádků naznačovalo:** 20 `!important` celkem, **žádný selektor se třemi a více složenými částmi**, tokeny v `tokens.css` (69 hodnot) proti 27 hardcoded hex v `index.css`.

---

## 6. Nález, který jsem způsobil sám

**D6-1 (P1) — `app-update-banner` překrývá hlavičku aplikace.** Je `position: fixed; top: 0; z-index: 70`, takže když se objeví nabídka nové verze, leží **přes** `app-header` s brandem rodiny místo aby ho odsunula.

Přidal jsem ho v offline batchi P2 (service-worker update prompt). Fungovat funguje, ale vizuálně to není v pořádku a měl jsem to tehdy ověřit v prohlížeči.

---

## 7. Prioritizace

### P0

| ID | Nález | Dopad |
| --- | --- | --- |
| D3-1 | lokální CSS snižuje sdílená tlačítka pod 44 px na třech místech | prvky pod hranicí spolehlivého dotyku, a nic proti tomu nechrání |

### P1

| ID | Nález |
| --- | --- |
| D1-1 | `home-title` používají všechny obrazovky |
| D1-2 | Home nemá `screen-header` a má jinou velikost nadpisu |
| D2-1 | čtyři zápisy pro sekundární akci |
| D2-2 | `header-action-button btn-secondary` míchá layout a vzhled |
| D3-2 | `link` v reminder-actions 37 px široký |
| D6-1 | update banner překrývá hlavičku |

### P2

| ID | Nález |
| --- | --- |
| D1-3 | tři úrovně modifikátorů headeru, `/plan` mimo vzor |
| D3-3 | `month-grid-day` 39 px na 320 |
| D4-1 | přesah `tab-button` — ověřit záměr |
| D4-2 | přesah `allowance-summary-line` na 320 |

---

## 8. Doporučené pořadí vln

Beze změny proti `00_..._MAP.md`. Wave 1 (headers, toolbary, buttons, filtry) pokrývá D1-1, D1-2, D2-1, D2-2, D3-1 a D6-1 — tedy celé P0 a většinu P1.

## 9. Čím tenhle audit nahradit nejde

Vizuální průchod. Viz §0. Konkrétně neposouzeno: barevná harmonie, vertikální rytmus, hustota informací, stavy hover/focus/active, animace a přechody, dark mode (pokud existuje), skutečný vzhled na fyzickém zařízení.

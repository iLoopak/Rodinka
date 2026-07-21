# Mobile/PWA regrese a hardening modalů

Datum: 2026-07-21
Základ: `main` @ `bb25da2`
Metoda: statická analýza `src` + živé ověření v Browser pane (Chromium, mobilní viewport 375×812, i simulace zúženého výškového viewportu) proti autentizovanému seedovanému účtu. Skutečné iOS Safari / instalovanou iOS PWA / Android Chrome nešlo v tomhle prostředí spustit — proto samostatná [manuální test matice](./MOBILE_PWA_MANUAL_TEST_MATRIX.md) pro ověření na reálných zařízeních.

Návaznost: staví na `.modal-sheet-fullscreen` primitivu zavedeném v [Design Wave 2](../implementation/DESIGN_WAVE_2_MODAL_SHEET_FORMS_MOBILE.md) a na `key`-remount vzoru, který už správně používá `ChoresScreen`.

---

## Souhrn

Většina hlášených symptomů (nedosažitelný obsah v dlouhých modalech, save tlačítko mimo viewport, fullscreen route překrytá shellem, `100vh` vs `100dvh`, rozbité formuláře po otevření klávesnice) měla společnou příčinu: **tři nezávislé implementace téhož "něco teď vlastní celou obrazovku" zámku** (`Modal`, `MobileChatPortal`, fullscreen herní routy), **tři samostatně udržované "fullscreen sheet" CSS bloky** (`create-record-wizard`, `activity-form-modal`, `member-editor-sheet`, každý reimplementoval `height/max-height:100dvh`), a **nulové ošetření virtuální klávesnice** (`visualViewport` se nikde v repozitáři nepoužíval). K tomu pět detail/edit modalů sdílelo stejný stale-entity bug: lokální form state se sedoval z entity propu bez `key`/`useEffect` synchronizace.

Oprava je soustředěná do dvou nových sdílených hooků a konsolidace CSS, ne do bodových zásahů po obrazovkách — viz [MOBILE_LAYOUT_HARDENING.md](../implementation/MOBILE_LAYOUT_HARDENING.md) pro kontrakt.

---

## Nálezy a opravy

### 1. Tři nezávislé scroll-locky → `useScreenLock`

| Kde | Před | Po |
| --- | --- | --- |
| `Modal.tsx` | vlastní `openModalCount` modulová proměnná + `document.body.classList.add('has-modal-open')` | `useScreenLock()` (`src/hooks/useScreenLock.ts`) |
| `MobileChatPortal.tsx` | `document.body.style.overflow = 'hidden'` (inline styl, nezávislý na Modalu) | `useScreenLock()` |
| `FamilyJumpScreen`, `FamilyFleetScreen`, `FamilyFleetHangar` | žádný — spoléhaly čistě na vlastní `overflow: hidden` shell CSS | `useScreenLock()` navíc, jako obrana proti modalu otevřenému nad fullscreen routou |

Reálný bug, který to opravuje: modal otevřený nad plovoucím chatem (`MobileChatPortal`) měl dva nezávislé zámky, které o sobě nevěděly — čí unmount proběhl první, mohl odemknout `.app-main` scroll i pro tu druhou, stále otevřenou vrstvu. `useScreenLock` je ref-counted (stejný vzor jako původní `openModalCount`, jen sdílený), takže se odemyká až po unmountu posledního držitele. Pokryto `src/hooks/useScreenLock.test.ts`.

### 2. Chybějící ošetření klávesnice → `useVisualViewportInset`

`dvh` na iOS Safari se zmenšuje pro dynamickou URL lištu, ale **ne** pro virtuální klávesnici — to je zdokumentovaný gap, ne jen chybějící tooling. `src/hooks/useVisualViewportInset.ts` sleduje `window.visualViewport` (feature-detected, no-op tam, kde není podporován) a publikuje `--keyboard-inset` na `document.documentElement`. Spotřebitelé:

- `.modal-backdrop` (base `index.css`): `height: calc(100dvh - var(--keyboard-inset, 0px))` místo pevného `inset: 0`.
- `.modal-sheet` a `.modal-sheet.modal-sheet-fullscreen`: `max-height`/`height` odečítají `--keyboard-inset`.
- `.messages-fullscreen` (chat): stejný vzor.

Bez tohohle: `.modal-backdrop` je `position: fixed; inset: 0`, což na iOS **nereaguje na klávesnici** (jen na browser chrome) — sheet zarovnaný `align-items: flex-end` uvnitř by zůstal ukotvený u spodku *layout* viewportu, tedy za klávesnicí. Pokryto `src/hooks/useVisualViewportInset.test.ts`.

### 3. Tři fullscreen-sheet CSS bloky → jeden primitiv (`.modal-sheet.modal-sheet-fullscreen`)

`create-record-wizard`, `activity-form-modal` a `member-editor-sheet` každý nezávisle reimplementoval `height: 100dvh; max-height: 100dvh; overflow: hidden; ...`. Všechny tři teď žádají `<Modal size="fullscreen">` a dědí kontrakt z `src/styles/primitives/modal.css`; per-feature bloky v `index.css` si nechávají jen to, co je opravdu odlišné (padding hlavičky, pozadí tabů). Desktopové breakpointy (různé max-width/max-height cappy pro wizard/aktivitu/editora člena) zůstaly beze změny — to je legitimní vizuální rozdíl, ne duplicita.

**Regrese objevená a opravená při živém ověření:** `styles/primitives/modal.css` se importuje na řádku 7 `index.css`, tedy *před* definicí base `.modal-sheet` (řádek ~1769). Selektor `.modal-sheet-fullscreen` (jedna třída) má stejnou specificitu jako `.modal-sheet` (jedna třída) — vyhrává tedy ten, kdo je v cascade později, což byl po konsolidaci base `.modal-sheet` s `max-height: 88dvh`, ne fullscreen varianta. V Browser pane šlo živě vidět, že editor člena rodiny (fullscreen modal) měl `computed height: 714px` místo `812px` (přesně 88 % viewportu) — pod ním prosvítal ztlumený bottom-nav. Oprava: `.modal-sheet.modal-sheet-fullscreen` (compound selektor, obě třídy element vždy má současně), specificita `(0,2,0)` spolehlivě vyhrává bez ohledu na import order — stejný princip, jaký předtím používaly nahrazené per-feature bloky (`.modal-sheet.create-record-wizard` apod.). Po opravě ověřeno živě: sheet height `812px` pro editora člena i pro create-record wizard.

### 4. Pět stale-entity bugů → `key={entity.id}`

`ActivityDetailModal`, `MealDetailModal` a `MemberProfileModal` sedovaly lokální `editing`/form state přímo z entity propu, bez `key` na volajícím a bez `useEffect` synchronizace uvnitř. `ChoresScreen` už měl správnou opravu (`key={`${chore.id}:${mode}`}`) — zobecněno na zbytek:

| Volající | Komponenta | Řádek |
| --- | --- | --- |
| `ActivitiesScreen.tsx` | `ActivityDetailModal` | `key={selectedActivity.id}` |
| `MealLibraryTab.tsx` | `MealDetailModal` | `key={selectedMeal.id}` |
| `FamilyScreen.tsx`, `MoreScreen.tsx` | `MemberProfileModal` | `key={editingMember.id}` / `key={currentMember.id}` |
| `AllowanceBalances.tsx`, `AllowanceSection.tsx`, `MoreScreen.tsx` | `AllowancePlanDialog` | `key={kid.id}` / `key={child.id}` / `key={allowanceChild.id}` |

Konkrétní trigger pro Activities: `ActivitiesScreen.tsx` má `useEffect` řešící `?activity=` deep link, který volá `setSelectedActivity(resolution.item)` přímo — přechod z jedné neprázdné entity na jinou (bez tranzitu přes `null`) bez `key` by ponechal stejnou instanci `ActivityDetailModal` a její `editing` flag by přetekl na novou aktivitu. Regresní test dokazuje selhání *bez* klíče i opravu *s* ním — `src/staleEntityResetContract.test.tsx`.

### 5. Nálezy zaznamenané, ale záměrně neopravené

- **`.bottom-nav` výška je duplikovaná** ve čtyřech místech (`.app-main` padding-bottom na dvou místech přes cascade layery — 96px vs. finálních 102px). Sjednocení do jedné CSS proměnné by vyžadovalo zásah do tří po sobě jdoucích "design wave" cascade vrstev se stejnou specificitou — riziko vizuální regrese na desktopu bez odpovídajícího přínosu (žádné akceptační kritérium to nevyžaduje, jde čistě o maintenance risk). Ponecháno jako nález pro budoucí práci.
- **`ModalSize = 'sheet'`** (`Modal.tsx`) se nikde v kódu nepoužívá — je to no-op varianta, dědí stejné CSS jako `'centered'`. Mimo rozsah (mrtvý kód, ne mobile regrese).

---

## Screeny podle briefu

| Obrazovka | Ověření | Zjištění |
| --- | --- | --- |
| Dnes (dashboard) | kód + živě (zúžený viewport) | standardní shell, žádný fullscreen/modal problém |
| Kalendář | kód | `CalendarEntryDetailModal` používá base `Modal`, žádná fullscreen sazba potřeba |
| Unifikovaný create-record wizard | živě | opraveno (nález 3); sheet `812px = 100dvh`, sticky footer viditelný po scrollu |
| Detail/edit úkolu | kód (`ChoreDetailModal` už měl `key`) | beze změny, referenční vzor |
| Detail/edit aktivity | kód + živě (create flow) | opraveno (nález 3 + 4) |
| Detail/edit zdravotního záznamu | kód | `MedicalDetailModal` — stejný vzor jako Activity/Meal, ale bez fullscreen edit sheetu (menší formulář); mimo rozsah zjištěných regresí |
| Detail/edit položky jídelníčku | kód | `AddPlanEntryForm` v base `Modal`, beze změny potřeba |
| Editace profilu člena | živě | opraveno (nález 1, 3, 4); ověřen scroll jedné sekce, sticky footer, fullscreen bez shellu |
| Nastavení kapesného | kód | `AllowancePlanDialog` — stale-entity oprava (nález 4) |
| Sekce dětského účtu | kód | součást `MemberProfileModal`, pokryto opravou 1/3 |
| Nákupní seznam | kód | inline `Modal` v `ShoppingScreen`, base sheet, beze změny potřeba |
| Chat — seznam a fullscreen konverzace | živě | opraveno (nález 1, 2); `has-modal-open` i `--keyboard-inset` aktivní, žádné console errory |
| Family Jump | kód + živě (intro) | `useScreenLock` přidán (nález 1); CSS scroll-kontrakt už byl správně, viz `fullscreenRouteLayoutContract.test.ts` |
| Family Fleet (výběr pilota, game-over, pauza, Hangar) | živě (výběr pilota) | `useScreenLock` přidán; `.fleet-hud`/`.fleet-zones`/`.fleet-play` už měly korektní safe-area padding |
| Offline start a reconnect | kód (`OfflineFallbackScreen`, `offlineFallbackLayoutContract.test.ts`) | nedotčeno touhle prací — nepoužívá Modal/fullscreen-route mechaniku |

---

## Limity tohohle ověření

- Bez reálného iOS Safari / instalované PWA nelze ověřit `dvh` vs. dynamická URL lišta a skutečné chování `visualViewport` při otevření klávesnice — proto [manuální test matice](./MOBILE_PWA_MANUAL_TEST_MATRIX.md).
- Zdravotní záznamy, položky jídelníčku a nákupní seznam nemají v seedovaném účtu data k prokliku do edit režimu — ověřeno jen kódem (stejné primitivy jako u Activity/Meal, které živě ověřeny byly).
- Family Fleet gameplay/game-over/pauza obrazovky nebyly spuštěny živě (canvas-based hra); CSS kontrakt (safe-area, jediný scroll-vlastník) ověřen kódem a `fullscreenRouteLayoutContract.test.ts`.

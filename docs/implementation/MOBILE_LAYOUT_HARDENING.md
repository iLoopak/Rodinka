# Mobile layout hardening — kontrakt

Audit: [`docs/audits/MOBILE_PWA_REGRESSION_AUDIT.md`](../audits/MOBILE_PWA_REGRESSION_AUDIT.md)

Tenhle dokument popisuje sedm podporovaných layout vzorů a primitiv/hook, který za každý odpovídá. Cíl: nová obrazovka nebo modal se skládá z těchhle bloků, ne z nové sady `position: fixed`/`overflow` pravidel.

---

## Sdílené primitivy

| Primitiv | Soubor | Řeší |
| --- | --- | --- |
| `useScreenLock()` | `src/hooks/useScreenLock.ts` | Ref-counted "něco teď vlastní celou obrazovku" zámek — přidává `has-modal-open` na `document.body`, což zamyká `.app-main` scroll (`body.has-modal-open .app-main { overflow: hidden }` v `index.css`). Bezpečný pro vnořené konzumenty (modal nad chatem, modal nad fullscreen routou). |
| `useVisualViewportInset()` | `src/hooks/useVisualViewportInset.ts` | Publikuje `--keyboard-inset` (px) na `document.documentElement` ze `window.visualViewport`. No-op tam, kde `visualViewport` není podporovaný. |
| `.modal-sheet.modal-sheet-fullscreen` | `src/styles/primitives/modal.css` | Fullscreen sheet kontrakt: `height: calc(100dvh - var(--keyboard-inset, 0px))`, jeden scroll owner, safe-area padding v hlavičce. |
| `.sticky-action-footer` | `src/styles/primitives/form.css` | `position: sticky; bottom: 0` uvnitř scrollujícího sheetu — zůstává nad klávesnicí/safe-area, protože je to poslední element ve flow scrollující oblasti, ne `position: fixed` vůči viewportu. |
| `key={entity.id}` konvence | volající komponenty | Force-remount detail/edit modalu při přepnutí entity — viz níže. |

---

## 1. Standardní app-shell obrazovka

**Kdy:** běžná obrazovka uvnitř spodní navigace (Dnes, Kalendář, Rodina, ...).

**Jak:** routa s `shell: 'standard'` v `routeRegistry.ts` (default). `StandardAppShell` (`AppShell.tsx`) drží `.app-shell` (`height: 100dvh; overflow: hidden`) s jediným scrollujícím potomkem `.app-main` (`overflow-y: auto`). Hlavička a `BottomNavigation` jsou mimo `.app-main`, tedy mimo scroll.

**Nepiš:** vlastní `overflow`/`height` na kořeni obrazovky — `.app-main` už scroll vlastní.

## 2. Fullscreen route mimo app-shell

**Kdy:** celoobrazovkový zážitek bez shellu (Family Jump, Family Fleet, jejich Hangar).

**Jak:** routa se `shell: 'fullscreen'` v `routeRegistry.ts` — `AppRouteOutlet` pak vykreslí obrazovku bez hlavičky/nav/wizardu. Obrazovka si sama drží `height: 100dvh` (s `100vh` fallbackem) + `overflow: hidden` na kořeni a **jeden** scrollující potomek uvnitř (`.family-jump-menu-scroll`, `.fleet-scroll`). Zavolej `useScreenLock()` na začátku komponenty — obrana pro případ, že se nad routou otevře modal.

**Nepiš:** druhou "vlastní celou obrazovku" strategii vedle týhle — canvas-based gameplay (`.fleet-play`) je jedinou výjimkou, protože potřebuje `position: fixed` kvůli plnému překrytí i nad HUD prvky; i ten ale respektuje `env(safe-area-inset-*)`.

## 3. Scrollovatelný modal/drawer

**Kdy:** krátký až středně dlouhý dialog (detail záznamu, potvrzovací dialog).

**Jak:** `<Modal size="centered">` (default). `.modal-sheet` má `max-height: calc(88dvh - var(--keyboard-inset, 0px))` a `overflow-y: auto` — obsah scrolluje uvnitř sheetu, ne stránky. `Modal` volá `useScreenLock()` a `useVisualViewportInset()` interně, není potřeba nic navíc.

## 4. Form modal se sticky footer akcemi

**Kdy:** editační formulář, kde primární akce (Uložit/Potvrdit) musí zůstat dosažitelná i po scrollu.

**Jak:** `<Modal size="fullscreen">` pro dlouhé formuláře (víc než ~1 obrazovka obsahu) nebo `size="centered"` pro kratší. Poslední element uvnitř je `<StickyActionFooter>` (`src/components/ui/StickyActionFooter.tsx`) — `position: sticky; bottom: 0` uvnitř sheetu, ne `fixed` vůči viewportu, takže po plném scrollu zůstává poslední pole přímo nad ním, nikdy obsah nepřekrývá.

**Nepiš:** `position: fixed` footer navázaný na viewport — na iOS se špatně chová vůči klávesnici (viz vzor 6) a duplikuje, co `sticky` uvnitř scrollujícího sheetu dostane zdarma.

## 5. Obrazovka s fixní hlavičkou a nezávisle scrollujícím obsahem

**Kdy:** obrazovka s filtrama/taby nahoře, které mají zůstat vidět (Family Jump menu, Fleet intro/Hangar, `ReminderCenter`).

**Jak:** kořen `display: flex; flex-direction: column; overflow: hidden`, hlavička `flex: 0 0 auto`, obsah `flex: 1 1 auto; min-height: 0; overflow-y: auto`. `min-height: 0` je nutný — bez něj flex item nezmenší pod obsahovou výšku a scroll nikdy nenastane.

## 6. Klávesnicově bezpečný formulář

**Kdy:** jakýkoli formulář uvnitř modalu/fullscreen sheetu s textovými poli.

**Jak:** automaticky, pokud formulář žije uvnitř `<Modal>` nebo `MobileChatPortal` — oba volají `useVisualViewportInset()`, které nastaví `--keyboard-inset`. `.modal-backdrop` a `.modal-sheet(.modal-sheet-fullscreen)` tuhle proměnnou odečítají od své výšky, takže sheet (a s ním sticky footer) se zmenší přesně o to, co klávesnice zabírá — ne o to, co `dvh` samo o sobě dá (iOS `dvh` reaguje na URL lištu, ne na klávesnici).

**Nepiš:** vlastní `visualViewport` listener na jiném místě — jeden hook, sdílené `--keyboard-inset`, spotřebovává kdokoliv přes CSS `calc()`.

## 7. Offline/error stav

**Kdy:** selhání načtení, offline start.

**Jak:** `OfflineFallbackScreen` — jednosloupcová karta vystředěná uvnitř mobilních safe-areas, akce ve stejně širokém sloupci. Kontrakt pokrytý `offlineFallbackLayoutContract.test.ts`; tahle práce ho neměnila (nepoužívá Modal/fullscreen-route mechaniku).

---

## `key={entity.id}` konvence pro detail/edit modaly

Kdykoli obrazovka drží `useState<Entity | null>(null)` a podmíněně renderuje `{selected && <DetailModal entity={selected} .../>}`, **vždy přidej `key={selected.id}`** (případně `key={`${selected.id}:${mode}`}`, pokud modal má i editační/detailní režim řízený mimo sebe sama, jako `ChoreDetailModal`).

Proč: React podmíněný render bez `key` neremountuje instanci při přechodu z jedné neprázdné hodnoty na jinou neprázdnou — jen předá nové propy stávající instanci. Detail/edit modaly v týhle appce sedují lokální form state (a `editing` mód) přímo z propu při mountu, bez `useEffect` synchronizace zpátky na `entity.id`. Bez `key` tak přepnutí entity (např. přes deep link) může nechat starou entitu "prosáknout" do nové — viditelné jako modal, co zůstane v edit módu, nebo formulář se starými hodnotami pro novou entitu.

Test: `src/staleEntityResetContract.test.tsx` — kontroluje jak přítomnost `key` na všech současných volajících, tak (přes `rerender` bez `key`) že bug bez klíče skutečně nastává.

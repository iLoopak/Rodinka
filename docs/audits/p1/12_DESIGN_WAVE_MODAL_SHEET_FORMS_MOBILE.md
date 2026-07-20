# Rodinka — Design Wave 2: Modal/Sheet, formuláře, sticky Save a mobilní keyboard

Implementuj druhou design-system vlnu.

Scope:

- modal vs. mobile/fullscreen sheet contract,
- form field primitives,
- sticky Save footer,
- safe areas,
- scroll ownership,
- keyboard handling,
- iOS input zoom a visual viewport.

Jde o funkční UX refaktor, ne pouze CSS cleanup.

## Cíl

Dlouhé editace musí být použitelné na mobilu a iOS PWA:

- celý obsah lze odscrollovat,
- Save je dosažitelný,
- keyboard nepřekrývá aktivní pole ani footer,
- shell ani background nescrollují,
- focus se správně vrací,
- nested dialog nerozbije body lock.

## Modal/Sheet contract

Sjednoť existující `Modal` a mobilní varianty do jasného contractu.

Musí podporovat:

- desktop centered modal,
- mobile bottom sheet,
- mobile fullscreen sheet,
- scrollable body,
- fixed/sticky header,
- sticky action footer,
- nested dialog,
- focus trap,
- focus return,
- Escape,
- browser Back podle existujícího routing contractu,
- body scroll lock,
- dirty-state close confirmation,
- safe-area padding.

Nepřepisuj funkční focus trap bez důvodu. Rozšiř existující kvalitní základ.

## StickyActionFooter

Vytvoř shared primitive pro:

- Save,
- Cancel/Back,
- destructive secondary action,
- loading,
- disabled,
- safe-area bottom,
- keyboard-visible state.

Footer nesmí překrývat poslední form field. Scroll body musí mít odpovídající bottom padding.

## Form primitives

Vytvoř nebo sjednoť:

- `FormField`,
- `FieldLabel`,
- `FieldHint`,
- `InlineError`,
- input/select/textarea wrapper contract.

Požadavky:

- `id`/`htmlFor`,
- `aria-describedby`,
- required/error semantics,
- jednotný spacing,
- focus-visible,
- disabled/read-only,
- server error,
- no global stretching side effects.

Zachovej existující specializované pickery.

## Keyboard a iOS

Prověř a oprav:

- input font-size minimálně 16 px tam, kde iOS zoomuje,
- `100dvh`/visual viewport behavior,
- sticky footer při keyboard,
- shell transform/zoom po blur,
- scrollIntoView aktivního pole,
- orientation change,
- standalone PWA safe areas.

Nevytvářej user-agent hack, pokud lze problém řešit přes robustní viewport/layout contract.

## Migrační workflows

Migruj maximálně několik reprezentativních workflow v jednom PR:

1. Member Profile edit.
2. Allowance settings.
3. Activity/Meal nebo jiný dlouhý editor.
4. Create Record wizard pouze pokud používá stejný contract.

Další formuláře migruj navazujícími malými PR.

## Browser QA

Povinně:

- iPhone-like 375 × 812,
- 390 × 844,
- 320 × 568,
- Android-like 360 × 800,
- desktop.

Testuj:

- otevření,
- scroll na poslední pole,
- otevření keyboard,
- blur,
- Save,
- validation error nahoře i dole,
- nested confirm,
- rotate,
- close a focus return.

## Testy

1. focus trap/return,
2. body scroll lock,
3. nested modal,
4. sticky footer padding,
5. label/error semantics,
6. dirty close confirmation,
7. Save loading/double submit,
8. viewport/safe-area CSS contract,
9. no input zoom contract,
10. representative mobile screenshots.

## Dokumentace

Vytvoř:

```text
docs/implementation/DESIGN_WAVE_2_MODAL_SHEET_FORMS_MOBILE.md
```

## Co neměnit

- business validation pravidla,
- data repositories,
- full redesign editorů,
- všechny formuláře najednou,
- shell navigation mimo nutný fullscreen/scroll contract.

## Acceptance criteria

- Member edit a další vybrané dlouhé formuláře lze celé projít a uložit na iOS viewportu.
- Save je dostupný a není překryt keyboardem.
- Modal/Sheet má jediný dokumentovaný contract.
- Form fields mají jednotné label/hint/error semantics.
- Background/shell během otevřeného editoru nescrolluje.
- Nové řešení nepřidává další specificity patch vrstvu.

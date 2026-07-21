# Design Wave 2 — Modal/Sheet, formuláře, sticky Save a mobilní keyboard

Brief: [`docs/audits/p1/12_DESIGN_WAVE_MODAL_SHEET_FORMS_MOBILE.md`](../audits/p1/12_DESIGN_WAVE_MODAL_SHEET_FORMS_MOBILE.md)

## Nejdřív hranice ověření — čti to

Tahle vlna je podle briefu **funkční UX refaktor** zaměřený na iOS: keyboard nepřekrývá Save, safe areas, visual viewport. Právě tyhle věci v tomhle prostředí **ověřit nejde** — žádné screenshoty, žádná softwarová klávesnice v headless rendereru, žádné skutečné iOS zařízení.

Co jsem tedy udělal a co ne:

| Kritérium briefu | Stav |
| --- | --- |
| Label/hint/error semantics, aria-describedby | ✅ **ověřeno v běžícím prohlížeči** (DOM) |
| Sticky footer existuje, safe-area padding | ✅ ověřeno (computed CSS) |
| Save dostupný, nepřekrytý **klávesnicí** | ⚠️ **NEOVĚŘENO** — potřebuje reálné zařízení |
| Jediný modal/sheet contract | ✅ prop + dokumentace |
| Background nescrolluje | ✅ už existovalo (`has-modal-open`) |

Ber to jako „primitiva a jeden ověřený migration", ne jako „iOS keyboard je vyřešený". To poslední chce průchod na telefonu.

## Výchozí stav

`Modal` už byl silný: focus trap, focus return, Escape, body-lock (`has-modal-open`), nested ordering, portal, aria. Brief výslovně říká „nepřepisuj funkční focus trap" — nerozšiřoval jsem ho, jen přidal.

Chybělo:

- **Form field primitiva** — formuláře psaly `<label>text<input/></label>` ručně: žádné stabilní id, žádné `aria-describedby`, error plaval jinde v DOM.
- **Sticky footer primitivum** — čtyři zápisy: `modal-actions`, `form-actions`, `activity-form-footer`, ad-hoc.
- **Sheet varianty** — jeden `.modal-sheet` + per-usage className.

## Co přibylo

### `FormField` (+ `FieldControlProps`)

`src/components/ui/FormField.tsx`. Render-prop, **ne** context — pole nemůže vyrenderovat label bez zapojení inputu, protože asociace není volitelná:

```tsx
<FormField label="Email" error={error} required>
  {(field) => <input {...field} type="email" ... />}
</FormField>
```

Vygeneruje `id`, `aria-describedby` (hint + error), `aria-invalid`, `aria-required`. Required marker je **CSS `::after`**, ne DOM text, takže accessible name labelu zůstává čistý a `getByLabelText` ho najde.

Vzhled dědí z existujících `.field-label` / `.field-hint` / `.field-error` — migrace pole nic vizuálně nemění.

### `StickyActionFooter`

Konsoliduje čtyři footer zápisy. Používá Wave 1 `Button`. Safe-area bottom padding (Save mine iOS home indicator). Destruktivní akce je vizuálně oddělená od confirm páru, aby ji netrefila svalová paměť mířící na Save.

### Modal `size` contract

`centered` (default) / `sheet` / `fullscreen`. Base `.modal-sheet` už je responzivní (bottom sheet na mobilu, centered na desktopu), takže `centered` a `sheet` ho dědí — **`centered` je no-op, žádná existující modalka se nezměnila**. `fullscreen` generalizuje ověřený vzor create-record wizardu (`100dvh`, flex column).

## Migrace — `ChangeEmailForm`

Vědomě **jeden malý, ověřitelný** formulář, ne 562řádkový `MemberProfileModal` naslepo. `ChangeEmailForm` měl přesně cílové anti-patterny: `<label>` nesting, `modal-actions` footer, error plovoucí pod footerem bez vazby na pole.

**Ověřeno v běžícím prohlížeči na 375×812:**

| Kontrakt | Výsledek |
| --- | --- |
| label `for` === input `id` | ✅ obě pole |
| `aria-required` | ✅ |
| input font-size | ✅ 16px (iOS nezoomuje) |
| footer sticky + border-top | ✅ |
| horizontal overflow | ✅ 0 |
| **error → `aria-describedby` na poli** | ✅ po submitu nesouhlasných e-mailů: error má `role=alert`, `id`, input `aria-describedby` míří na něj, `aria-invalid=true` |

Tohle je reálné zlepšení: dřív error plaval pod footerem bez vazby; teď je u pole, kde nesoulad vzniká.

## Odchylky a co zbývá

**Nemigroval jsem velké editory** (Member Profile, Allowance, Activity). Brief říká „max pár reprezentativních workflow v jednom PR" a „nemigruj všechny formuláře najednou". Zvlášť u 562řádkové member modalky by migrace naslepo, bez vizuálního ověření, byla přesně to riziko, před kterým QA sekce briefu varuje.

**Sheet/fullscreen varianty nemají consumera.** `size` prop existuje a `fullscreen` CSS je ověřitelné, ale žádná modalka ho zatím nepoužívá (wizard má vlastní třídu). Migrace wizardu na `size="fullscreen"` je navazující krok.

**iOS keyboard chování neověřeno** — viz hranice nahoře.

## Guard

`src/formPrimitiveContract.test.tsx` (9 testů): label asociace, hint/error aria-describedby, invalid semantics, čistý accessible name, žádné describedby bez hint/error; footer submit/cancel, loading disable + aria-busy, destruktivní akce oddělená; a že footer CSS má safe-area padding.

`cssArchitectureContract` aktualizován o `form.css` a `modal.css` do sanctioned listu.

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 226 souborů, 1413 testů |
| `npm run build` | ✅ včetně bundle guardu, bez zvýšení rozpočtu |
| Browser QA | ⚠️ **jen DOM/computed** — semantics, rozměry, overflow, funkčnost. Bez vizuálního posouzení a **bez reálné klávesnice**. |

## Pro další design vlny

- Migrace `MemberProfileModal`, `AllowancePlanForm`, `AddActivityForm` na primitiva.
- Wizard na `size="fullscreen"`.
- **Průchod na reálném iOS zařízení** — keyboard vs. sticky footer, visual viewport, safe areas, blur/zoom.
- Zbylé footer zápisy (`activity-form-footer` atd.) po migraci jejich consumerů.

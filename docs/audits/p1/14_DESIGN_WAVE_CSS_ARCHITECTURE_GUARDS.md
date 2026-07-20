# Rodinka — Design Wave 4: CSS architektura, guardy a specificity cleanup

Implementuj čtvrtou design-system vlnu až po vytvoření a ověření hlavních primitives.

Cílem není přepsat celý stylesheet. Cílem je vytvořit dlouhodobě udržitelnou strukturu a zabránit dalšímu růstu globálních side effects.

## Cílová struktura

Minimálně:

```text
src/styles/
  tokens.css
  base.css
  primitives/
  layout/
  features/
```

Přesné soubory přizpůsob build/import architektuře.

## Princip migrace

Použij postupnou „boy scout“ migraci:

1. vyber konkrétní workflow,
2. převeď ho na shared primitive,
3. přesuň relevantní CSS,
4. ověř všechny consumers,
5. teprve potom smaž staré globální pravidlo nebo patch.

Neprováděj automatický split podle pořadí řádků bez znalosti dependencies.

## Tokens

Centralizuj:

- color tokens,
- member accent tokens,
- spacing,
- radius,
- shadows,
- typography,
- z-index layers,
- safe-area variables,
- motion durations.

Zachovej backward-compatible aliases po dobu migrace, pokud je používá mnoho míst.

## Base contract

`base.css` může obsahovat pouze jasně dokumentované element defaults:

- box sizing,
- body/root,
- typography inheritance,
- button/input font inheritance,
- media defaults,
- accessible focus baseline.

Zakázané bez výslovného důvodu:

- obecné `label { ... }` měnící layout,
- obecné `input { width: 100% }`,
- obecné `li` layout rules,
- feature styling přes element selector,
- hluboké descendant řetězce,
- nový `!important` patch.

## Automatický CSS guard

Přidej reprodukovatelný script/test, například:

```json
"check:css-contract": "node scripts/check-css-contract.mjs"
```

Guard má kontrolovat minimálně:

- nové zakázané globální element selectors,
- `!important`,
- undefined CSS variables,
- duplicity kritických custom properties,
- překročení specificity limitu,
- left-border status pattern, pokud je v projektu zakázán,
- chybějící reduced-motion handling pro animations,
- feature selector umístěný mimo feature styles.

Použij parser, například PostCSS AST. Nepoužívej pouze řádkový regex, pokud by dával mnoho false positives.

Allowlist musí být přesný a komentovaný.

## Specificity cleanup

Najdi současné patches typu:

```text
global selector
→ feature override
→ mobile override
→ emergency !important
```

Migruj je po workflow.

U každého odstraněného patch chainu zapiš:

- původní příčinu,
- nový primitive/base contract,
- consumers,
- visual regression ověření.

## Feature styles a lazy routes

Kde build architektura umožňuje:

- importuj feature CSS z feature entry,
- nenačítej Family Jump/Messages/Create Record styles v main, pokud jsou lazy,
- zkontroluj Vite manifest/analyzer.

Nesekej sdílené primitive CSS do každého chunku duplicitně.

## Dead CSS

Odstraňuj pouze prokazatelně nepoužívané rules.

Použij kombinaci:

- source search,
- runtime route QA,
- test coverage,
- případně coverage tooling.

Nevěř slepě pouze static class search kvůli dynamicky skládaným třídám.

## Testy a QA

1. CSS contract guard,
2. undefined variables,
3. reduced motion,
4. no prohibited global selector,
5. no new `!important`,
6. representative visual screenshots,
7. dark/light mode, pokud podporováno,
8. member accent variants,
9. lazy route CSS manifest,
10. Czech/English text wrapping.

## Dokumentace

Vytvoř:

```text
docs/implementation/DESIGN_WAVE_4_CSS_ARCHITECTURE_GUARDS.md
```

Zapiš:

- before/after počet CSS řádků a raw/gzip,
- počet globálních selectors,
- počet `!important`,
- odstraněné patch chains,
- nové allowlist výjimky,
- zbývající migrační oblasti.

## Co neměnit

- celý vizuální design,
- všechny feature styles najednou,
- business logiku,
- component API bez migrační potřeby,
- CSS framework.

## Acceptance criteria

- Styles mají jasné tokens/base/primitives/layout/features hranice.
- Nové nebezpečné globální selectors blokuje automatický guard.
- Specificity cleanup probíhá po workflows.
- Lazy feature CSS není zbytečně součástí main, kde to build umožňuje.
- Neproběhl big-bang rewrite celého stylesheetu.

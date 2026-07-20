# Rodinka — Wave 7: rerender, CSS a font performance cleanup

Tato vlna je optimalizační follow-up po hlavních architektonických změnách.

Nevycházej pouze ze statického auditu. Použij aktuální bundle analyzer, React Profiler/browser measurements a reálné before/after hodnoty.

## Cíle

1. Stabilizovat velké context values.
2. Omezit další rerender fan-out.
3. Rozdělit největší shared contexty pouze tam, kde měření ukáže přínos.
4. Snížit globální CSS a font footprint.
5. Zachovat vizuální integritu českých znaků a PWA.

## A. Context value stabilization

Projdi feature providery a zjisti, které context values vznikají jako nový objekt při každém renderu.

Prioritizuj podle reálného render fan-out:

- FamilyMembers,
- FamilySettings,
- Chores,
- Allowance,
- Activities,
- Occurrence Assignments,
- Medical,
- Meals,
- Shopping,
- Reminder,
- Push.

Nepřidávej `useMemo` mechanicky všude.

Použij ho tam, kde:

- dependency list je jasný,
- value obsahuje stabilní callbacks/data,
- consumer subtree je významný,
- profiler ukazuje zbytečné rerenders.

Pokud context kombinuje rychle a pomalu měněná data, rozděl jej na malé contexts nebo selector-friendly store.

## B. Reminder source fan-out

`ReminderProvider` čte více feature contexts a přepočítává drafts.

Audituj:

- jak často se draft generation spouští,
- zda se sync RPC volá při nerelevantní změně,
- zda lze použít stable selectors,
- zda lze debounce nebo reason-based synchronization,
- zda lze oddělit unread summary od full reminder data.

Nesmí dojít ke zpoždění nebo ztrátě důležitých reminders.

## C. Router value

Stabilizuj Router context value a posuď rozdělení:

- path,
- search params,
- navigation actions.

Consumer sledující pouze `path` nemá rerenderovat kvůli nerelevantní změně action identity.

Nepřidávej velkou routing knihovnu.

## D. CSS modularizace

Aktuální globální stylesheet je velmi rozsáhlý.

Neprováděj big-bang rewrite.

V této vlně:

1. rozděl tokens/base od feature styles,
2. přesuň CSS lazy routes tak, aby pokud možno následovalo route chunk,
3. odstraň pouze prokazatelně nepoužívaná pravidla,
4. zaveď guard proti novým nebezpečným globálním selektorům,
5. zachovej existující CSS variables jako compatibility API.

Doporučená struktura:

```text
src/styles/
  tokens.css
  base.css
  shell.css
  primitives/
  features/
```

Začni feature CSS pro:

- Family Jump,
- Messages,
- Create Record wizard.

## E. Fonty

Audit uvádí čtyři Manrope weights a mnoho font assetů.

Prověř:

- které weights aplikace skutečně používá,
- které unicode subsets jsou nutné pro češtinu a angličtinu,
- zda lze importovat explicitní latin/latin-ext subset,
- zda browser waterfall skutečně stahuje zbytečné soubory.

Nesmíš rozbít:

- českou diakritiku,
- bold hierarchy,
- offline font availability,
- PWA cache.

## F. Performance budgets

Aktualizuj bundle guard podle nového stabilního baseline.

Přidej rozumné budgets pro:

- main JS gzip,
- main CSS gzip,
- Family Jump chunk,
- Messages chunk,
- route CSS.

Budgets musí být tolerantní a zdokumentované.

## Testy a QA

1. context render-count tests,
2. Reminder generation při relevantních a nerelevantních změnách,
3. route navigation a search params,
4. CSS contract tests,
5. visual smoke screenshots,
6. české znaky a font weights,
7. offline PWA font load,
8. bundle budget script,
9. no unused route CSS in main podle manifest/analyzeru.

## Dokumentace

Vytvoř:

```text
docs/implementation/WAVE_7_RENDER_CSS_FONT_CLEANUP.md
```

Zahrň:

- profiler before/after,
- contexty změněné a ponechané,
- CSS raw/gzip before/after,
- font request waterfall before/after,
- aktualizované budgets.

## Co neměnit

- business logiku,
- databázové schema,
- offline queues,
- route UX,
- visual redesign,
- kompletní design-system rewrite.

## Acceptance criteria

- Optimalizace jsou doložené měřením, ne pouze odhadem.
- AppShell a ReminderProvider mají menší rerender fan-out.
- Lazy feature CSS není zbytečně v main, kde to build umožňuje.
- Česká diakritika a offline fonty fungují.
- Bundle budgets jsou součástí reprodukovatelné kontroly.

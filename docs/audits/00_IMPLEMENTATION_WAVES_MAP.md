# Rodinka — implementační vlny po startup/provider/bundle auditu

Tato roadmapa rozděluje nálezy z `STARTUP_PROVIDER_BUNDLE_AUDIT.md` do bezpečných, navazujících implementačních vln.

Každá vlna má být samostatný PR. Nepřeskakuj dopředu, pokud předchozí vlna změnila společné architektonické hranice a její výsledky ještě nejsou ověřené na `main`.

## Pořadí

```text
Wave 1 — Route registry, lazy routes a bundle guard
    ↓
Wave 2 — Nízkorizikové startup deferrals a lazy globální UI
    ↓
Wave 3 — Realtime lifecycle diagnostika a úzké status contexts
    ↓
Wave 4 — Calendar startup deduplikace a odložený online refresh
    ↓
Wave 5 — Messages summary/content split
    ↓
Wave 6 — Auth/family bootstrap paralelizace a cached-validating stav
    ↓
Wave 7 — Rerender, CSS a font performance cleanup
```

## Proč právě takto

### Wave 1

Nejvyšší poměr přínosu a rizika. Odstraní velké route obrazovky a Family Jump engine z hlavního chunku bez zásahu do datové vrstvy.

### Wave 2

Odloží jasně route-specific práci a omezí eager importy. Ještě stále se vyhýbá zásahu do složitého Calendar a Messages lifecycle.

### Wave 3

Nejdřív zavede měření a úzké status rozhraní. Teprve potom je bezpečné upravovat subscriptions a provider lifecycle.

### Wave 4

Řeší největší datový P0 problém: duplicitní Calendar snapshot requesty a subscriptions. Využije diagnostiku z Wave 3.

### Wave 5

Oddělí globálně potřebný unread/conversation summary stav od těžkého route obsahu chatu.

### Wave 6

Optimalizuje kritický auth/family bootstrap. Jde o citlivou změnu, proto až po stabilizaci routingu, lifecycle a diagnostiky.

### Wave 7

Provede další optimalizace až nad stabilními hranicemi a podle nových before/after měření.

## Společná pravidla pro všechny vlny

1. Neprováděj plošný rewrite.
2. Jeden PR řeší jednu architektonickou hranici.
3. Zachovej stávající UX a datové chování, pokud prompt výslovně neurčuje jinak.
4. Před změnou zapiš before baseline.
5. Po změně zapiš after výsledky.
6. Nová diagnostika musí být development-only a nesmí obsahovat osobní data.
7. Nesmí vzniknout duplicate fetch, duplicate realtime channel nebo paralelní source of truth.
8. Direct refresh každé top-level route musí fungovat.
9. Offline Home, Calendar, Shopping, push deep links, child restrictions a Family Jump musí zůstat funkční.
10. Každá vlna musí skončit aktualizací auditní dokumentace nebo samostatným implementation reportem.

## Povinná validace každé vlny

```bash
npm run lint
npm test
npm run build
npm run check:edge-functions
git diff --check
```

Pokud se vlna dotýká databázových nebo authorization hranic a je dostupný lokální Supabase stack:

```bash
npm run test:db
```

## Doporučené názvy větví

```text
codex/wave-1-route-registry-lazy-bundle
codex/wave-2-startup-deferrals
codex/wave-3-realtime-status-boundaries
codex/wave-4-calendar-startup-dedup
codex/wave-5-messages-summary-split
codex/wave-6-auth-family-bootstrap
codex/wave-7-render-css-font-cleanup
```

## Doporučený ownership

| Vlna | Primární nástroj |
|---|---|
| Wave 1 | Codex |
| Wave 2 | Codex |
| Wave 3 | Codex |
| Wave 4 | Codex |
| Wave 5 | Codex |
| Wave 6 | Codex |
| Wave 7 | Codex, browser QA případně Claude Code |

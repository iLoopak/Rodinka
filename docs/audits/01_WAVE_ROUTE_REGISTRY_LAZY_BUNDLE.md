# Rodinka — Wave 1: route registry, lazy routes a bundle guard

Implementuj první stabilizační vlnu podle hotového startup/provider/bundle auditu.

Cílem této vlny je odstranit velké route obrazovky z hlavního eager chunku, zjednodušit `AppShell` a zavést měřitelný bundle contract.

Tato vlna se nesmí pokoušet refaktorovat provider graph, offline repositories ani auth bootstrap.

## Výchozí baseline

Aktuální audit naměřil přibližně:

- hlavní JS chunk: `1 253 670 B` raw,
- hlavní JS chunk: `344,36 kB` gzip,
- CSS chunk: `196 007 B` raw,
- žádný produkční route-level dynamic import,
- Family Jump, Messages a další velké obrazovky jsou eager součástí main chunku.

Před implementací baseline znovu ověř na aktuálním `main` a zapiš skutečné hodnoty.

## Cíle

1. Nahradit ruční řetězec `path === ...` deklarativním route registry.
2. Zavést route-level lazy loading.
3. Zachovat stávající lightweight `pushState` router.
4. Zachovat fullscreen chování Family Jump.
5. Zachovat offline gating, child capability rules a fallback routy.
6. Přidat bundle analyzer a stabilní guard.
7. Zdokumentovat before/after hodnoty.

## Implementace

### A. Route registry

Vytvoř malý explicitní route registry, například v:

```text
src/routes/
  routeRegistry.tsx
  RouteRenderer.tsx
```

Přesné názvy přizpůsob repozitáři.

Každá route definice musí umět nést minimálně:

```ts
interface RouteDefinition {
  path: Route
  load: () => Promise<{ default: React.ComponentType }>
  offlinePolicy: 'available' | 'blocked'
  shell: 'standard' | 'fullscreen'
  capability?: string
  fallback?: Route
}
```

Přesný typ může být jiný, ale pravidla nesmí zůstat rozházená v sérii JSX podmínek.

Registry musí být jediným top-level zdrojem pro:

- route component,
- lazy loader,
- shell/fullscreen režim,
- offline dostupnost,
- capability pravidlo,
- fallback route.

Nepřidávej React Router ani jiný velký routing framework.

### B. Lazy routes

Minimálně lazy-load:

- `/family-jump`,
- `/messages`,
- `/meals`,
- `/health`,
- `/activities`,
- `/family`,
- `/more`,
- `/reminders`.

Podle analyzeru posuď také:

- `/calendar`,
- `/plan`,
- `/chores`,
- `/shopping`.

`/` může zůstat eager, pokud to snižuje time-to-useful Home.

Family Jump musí skončit v samostatném chunku a jeho engine nesmí být součástí main entry chunku.

### C. Suspense a loading UI

Použij jeden sdílený route-loading fallback, který:

- odpovídá vizuálnímu stylu Rodinky,
- používá existující `FamilyMark`,
- má přístupný status text,
- nezpůsobí layout shift shellu,
- respektuje fullscreen route.

Nepřidávej několik různých spinnerů.

### D. Direct refresh a deep links

Ověř, že funguje:

- direct browser refresh na každé top-level route,
- Vercel/client-side fallback,
- push cold-start deep link do Messages,
- reminder deep link,
- query params a hash,
- browser Back/Forward.

### E. Bundle analyzer

Přidej development-only bundle analyzer, například přes `rollup-plugin-visualizer`, a script:

```json
"build:analyze": "..."
```

Analyzer nesmí přidávat production runtime kód.

### F. Bundle manifest a guard

Zapni Vite manifest nebo obdobný build output a přidej script, například:

```text
scripts/check-route-chunks.mjs
```

Guard musí ověřit minimálně:

- Family Jump má samostatný dynamic chunk,
- Messages má samostatný dynamic chunk,
- Meals má samostatný dynamic chunk,
- jejich hlavní module IDs nejsou přímo v entry chunku,
- main chunk nepřekročí rozumný tolerantní budget.

Budget nesmí být křehký na několik KB. Použij procentní toleranci nebo jasně zdokumentovaný limit.

Přidej script například:

```json
"check:bundle": "node scripts/check-route-chunks.mjs"
```

A zahrň ho do validačních příkazů nebo CI-ready dokumentace.

## Testy

Doplň testy pro:

1. registry obsahuje všechny top-level routes,
2. neznámá route se normalizuje na `/`,
3. fullscreen Family Jump nepoužívá standardní AppShell,
4. offline policy blokuje pouze očekávané routes,
5. child capability fallback zůstává správný,
6. lazy route zobrazí loading fallback a následně obrazovku,
7. push/deep-link navigace otevře lazy Messages route,
8. query params a hash přežijí navigaci,
9. direct refresh contract pro všechny routes,
10. bundle guard zachytí návrat Family Jump do main chunku.

## Dokumentace

Vytvoř:

```text
docs/implementation/WAVE_1_ROUTE_REGISTRY_LAZY_BUNDLE.md
```

Uveď:

- before/after raw a gzip velikosti,
- seznam vzniklých chunků,
- které routes zůstaly eager a proč,
- rizika a follow-up,
- výsledky testů.

## Co neměnit

- provider graph,
- Supabase query lifecycle,
- realtime subscriptions,
- Calendar/Shopping offline repositories,
- auth/family bootstrap,
- permissions/RLS,
- UX jednotlivých screens.

## Acceptance criteria

- `AppShell` neobsahuje dlouhou sérii ručně udržovaných route render podmínek.
- Route policy je deklarativní a testovatelná.
- Family Jump, Messages a Meals jsou samostatné lazy chunks.
- Main JS chunk je měřitelně menší než baseline.
- Direct refresh, push deep links, offline gating a child restrictions fungují.
- Existuje bundle analyzer a reprodukovatelný bundle guard.
- Nevznikl nový router monolit ani produkční runtime dependency bez důvodu.

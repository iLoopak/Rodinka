# Rodinka Jump — implementační plán MVP

## Kontext v repozitáři

- Aplikace používá vlastní `pushState` router a jeden `AppShell`. Hra dostane samostatnou route `/family-jump`; na této route se AppShell vůbec nevykreslí, aby se herní canvas nekřížil s hlavičkou, spodní navigací ani scroll kontejnerem.
- Aktivní rodina a členové jsou dostupní přes `FamilyCoreContext` a `FamilyMembersContext`. Výběr hráče proto používá skutečné aktivní členy a funguje i nad jejich perzistentní offline cache.
- Dynamické logo i profily používají `getMemberColorTheme`. Stejná funkce bude jediným zdrojem hlavní a jemné barvy herní postavičky, značek rekordů i leaderboardu.
- Repo má obecnou persistentní query cache a specializovaná IndexedDB úložiště pro synchronizované domény. Herní rekord je malý, lokální a synchronní údaj, proto MVP použije úzce zapouzdřený, rodinou scopeovaný adapter nad `localStorage` s paměťovým fallbackem. Nevznikne druhý obecný sync systém.

## Modul

```text
src/features/family-jump/
  components/   React obrazovky, canvas host a přístupné ovládání
  config/       všechny fyzikální a generační konstanty
  game/         čistý stav, fyzika, generátor a canvas engine
  storage/      verzované lokální rekordy
  types/        herní typy
```

React řídí vstup, výběr člena, pauzu, game over a leaderboard. Aktivní herní smyčka žije mimo React, používá `requestAnimationFrame`, delta time s omezenými podkroky a kreslí do Canvas 2D ve správném `devicePixelRatio`. React stav se během hry aktualizuje jen throttlovaně pro přístupný text, ne každý frame.

## Herní model

- Souřadnice jsou v CSS pixelech. Gravitace, impuls, akcelerace, tření, maximální rychlosti, kamera a rozestupy plošinek jsou v jednom readonly configu.
- Kolize se vyhodnocuje jen při pádu a přes průsečík spodní hrany postavy s horní hranou stabilní plošinky. Po dopadu se postava položí přesně na plošinku a ihned dostane nový impuls.
- Kamera při překročení prahu vrátí hráče na práh a posune svět dolů. Součet těchto posunů je nezávislý na FPS a převádí se na metry.
- Generátor navazuje každou povinnou plošinku na poslední. Svislý i vodorovný krok je omezen dosahem nakonfigurovaného skoku; doplňkové plošinky nejsou potřeba pro hratelnost. Typ plošinky je už nyní diskriminovaný (`stable`) kvůli budoucím variantám.
- Horizontální pozice postavy se wrapuje přes oba okraje viewportu.

## Ovládání a životní cyklus

- Levá a pravá dotyková polovina používají pointer capture a obsluhují `pointerup`, `pointercancel` i `lostpointercapture`. Herní plocha má `touch-action: none`, takže nevyvolá scroll ani gesture zoom.
- Desktop používá `ArrowLeft`, `ArrowRight`, `A`, `D`; `P` pozastaví hru.
- Změna viditelnosti stránku automaticky pozastaví. Unmount zruší RAF, observer i všechny listenery.
- Fullscreen view respektuje safe-area insety a `100dvh`. Důležité stavy a skóre mají živý DOM text mimo canvas.

## Rekordy a synchronizace

Lokální klíč je verzovaný a obsahuje `familyId`, `gameKey=family_jump`, mapu `memberId -> bestScore` a `updatedAt`. Zápis proběhne pouze při vyšším výsledku a bez síťového požadavku během runu.

Online sync není součástí stabilního lokálního MVP. Nejmenší budoucí tabulka:

```text
family_game_scores(
  family_id uuid not null,
  member_id uuid not null,
  game_key text not null,
  best_score integer not null check (best_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (family_id, member_id, game_key)
)
```

`member_id` má odkazovat na `members(id)` a být svázán se stejným `family_id`. RLS má povolit select jen členům rodiny a zápis jen aktivním členům stejné rodiny. Bezpečný serverový zápis má být jedna idempotentní RPC/upsert operace ve tvaru `best_score = greatest(existing.best_score, incoming.best_score)`. Teprve po doplnění migrace se lokální adapter rozšíří o malou outbox/sync vrstvu; lokální výsledek zůstane okamžitým zdrojem UI.

## Ověření

- Unit testy pokryjí gravitaci, odraz, wrap, landing, skóre, dosažitelnost generovaných plošinek, update rekordu a leaderboard.
- Následně proběhne celý Vitest suite, lint, TypeScript build a produkční Vite build.


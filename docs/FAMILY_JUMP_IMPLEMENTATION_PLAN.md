# Rodinka Jump — implementační plán MVP

## Kontext v repozitáři

- Aplikace používá vlastní `pushState` router a jeden `AppShell`. Hra dostane samostatnou route `/family-jump`; na této route se AppShell vůbec nevykreslí, aby se herní canvas nekřížil s hlavičkou, spodní navigací ani scroll kontejnerem.
- Aktivní rodina a členové jsou dostupní přes `FamilyCoreContext` a `FamilyMembersContext`. Výběr hráče proto používá skutečné aktivní členy a funguje i nad jejich perzistentní offline cache.
- Dynamické logo i profily používají `getMemberColorTheme`. Stejná funkce bude jediným zdrojem hlavní a jemné barvy herní postavičky, značek rekordů i leaderboardu.
- Repo má obecnou persistentní query cache a specializovaná IndexedDB úložiště pro synchronizované domény. Herní rekord je malý údaj, proto offline cache používá úzce zapouzdřený, rodinou scopeovaný adapter nad `localStorage` s paměťovým fallbackem. Nad ním běží pouze malá synchronizační vrstva pro rodinné rekordy; nevzniká druhý obecný sync systém.

## Modul

```text
src/features/family-jump/
  components/   React obrazovky, canvas host a přístupné ovládání
  config/       všechny fyzikální a generační konstanty
  game/         čistý stav, fyzika, generátor a canvas engine
  storage/      verzované lokální rekordy a úzký Supabase sync adapter
  types/        herní typy
```

React řídí vstup, výběr člena, pauzu, game over a leaderboard. Aktivní herní smyčka žije mimo React, používá `requestAnimationFrame`, delta time s omezenými podkroky a kreslí do Canvas 2D ve správném `devicePixelRatio`. React stav se během hry aktualizuje jen throttlovaně pro přístupný text, ne každý frame.

## Herní model

- Souřadnice jsou v CSS pixelech. Gravitace, impuls, akcelerace, tření, maximální rychlosti, kamera a rozestupy plošinek jsou v jednom readonly configu.
- Kolize se vyhodnocuje jen při pádu a přes průsečík spodní hrany postavy s horní hranou stabilní plošinky. Po dopadu se postava položí přesně na plošinku a ihned dostane nový impuls.
- Kamera při překročení prahu vrátí hráče na práh a posune svět dolů. Součet těchto posunů je nezávislý na FPS a převádí se na metry.
- Generátor navazuje každou povinnou plošinku na poslední. Svislý i vodorovný krok je omezen dosahem nakonfigurovaného skoku; doplňkové plošinky nejsou potřeba pro hratelnost. Typ plošinky je už nyní diskriminovaný (`stable`) kvůli budoucím variantám.
- První výškové úseky používají menší mezery. Povolený rozsah se plynule zvětšuje do 1 200 m a generátor po nejvýše dvou krocích stejným směrem vynutí změnu, aniž by vytvářel pravidelný cikcak.
- Horizontální pozice postavy se wrapuje přes oba okraje viewportu.

## Ovládání a životní cyklus

- Levá a pravá dotyková polovina používají pointer capture a obsluhují `pointerup`, `pointercancel` i `lostpointercapture`. Herní plocha má `touch-action: none`, takže nevyvolá scroll ani gesture zoom.
- Desktop používá `ArrowLeft`, `ArrowRight`, `A`, `D`; `P` pozastaví hru.
- Změna viditelnosti stránku automaticky pozastaví. Unmount zruší RAF, observer i všechny listenery.
- Fullscreen view respektuje safe-area insety a `100dvh`. Důležité stavy a skóre mají živý DOM text mimo canvas.
- Celá levá a pravá polovina herní plochy pod bezpečnou HUD zónou funguje jako dotykové ovládání. Spodní šipky jsou pouze nápověda; blur, skrytí aplikace i ztráta pointer capture vždy uvolní vstup.

## V1 vizuální pravidla

- Figurky v menu i canvasu používají jako jedinou barevnou plochu přesnou primární accent barvu člena. Obličej, nožičky a dynamický stín jsou neutrální.
- Canvasový hráč má hitbox `46 × 53 px`, shodný se základním viditelným tělem. Squash, stretch, náklon a reakce platformy jsou pouze render transformace a při `prefers-reduced-motion` se vypnou.
- Platformy mají zvýrazněnou aktivní horní hranu. Dekorace jsou menší, méně kontrastní a pohybují se pomaleji než herní objekty.
- Horní HUD má samostatnou safe-area masku; herní objekty mohou fyzicky pokračovat pod ní, ale nejsou přes ovládací prvky vidět a HUD nemění fyziku.
- Z běžné aplikace otevírá hru pouze 44px přístupné tlačítko obalující dynamické logo. Wordmark, název rodiny ani okolní header nejsou součástí hit targetu.

## Rekordy a synchronizace

Lokální klíč je verzovaný a obsahuje `familyId`, `gameKey=family_jump`, mapu `memberId -> bestScore` a `updatedAt`. Zápis proběhne pouze při vyšším výsledku a bez síťového požadavku během runu.

Online synchronizace je implementovaná jako úzká vrstva nad lokálním MVP. Používá tabulku:

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

Migrace `20260720140000_family_jump_scores.sql` povoluje čtení pouze členům stejné rodiny a nepovoluje žádné přímé klientské zápisy. Zápis vede přes idempotentní RPC `record_family_game_score`, která ověřuje aktivního přihlášeného člena, aktivního cílového hráče stejné rodiny a monotónně ukládá pouze vyšší skóre.

Lokální výsledek zůstává okamžitým zdrojem UI i outboxem: při otevření hry a po dokončení runu se serverová a lokální mapa sloučí pravidlem `max(local, server)`. Vyšší lokální hodnoty se odešlou RPC a vyšší serverové hodnoty se uloží do lokální cache. Při offline stavu se nic neztratí a další přechod online vyvolá nový pokus. Aktivní herní run synchronizaci nespouští a při jeho startu zruší rozpracovaný čtecí požadavek.

Vedle osobního rekordu se pouze lokálně a bez historie ukládá poslední výsledek, nejlepší dnešní výsledek a celkový počet pokusů každého člena. Tyto souhrnné údaje se do Supabase neposílají.

## Ověření

- Unit testy pokryjí gravitaci, odraz, wrap, landing, skóre, dosažitelnost generovaných plošinek, update rekordu a leaderboard.
- Následně proběhne celý Vitest suite, lint, TypeScript build a produkční Vite build.

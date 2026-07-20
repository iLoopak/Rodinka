# Wave 1 — Route registry a lazy bundle

Datum implementace: 20. 7. 2026
Výchozí commit: `558757f` (`main` po merge PR #101)
Větev: `codex/wave-1-route-registry-lazy-bundle`

## Výsledek

Top-level routing má jeden deklarativní registr a všechny route obrazovky se načítají přes samostatné dynamické importy. Lightweight `pushState` router, Vercel SPA rewrite, offline pravidla, fullscreen Family Jump i capability/fallback pravidla zůstaly zachované.

Hlavní JS soubor se zmenšil z 1 253 670 B na 420 788 B, tedy o 66,4 %. Protože Vite část společného kódu rozdělil do staticky importovaných shared chunků, sleduje nový guard navíc celý počáteční eager graf: 847 766 B raw / 240 392 B gzip. Proti původnímu jedinému JS souboru je to pokles o 32,4 % raw a přibližně 30,2 % gzip.

## Before / after

| Metrika | Před Wave 1 | Po Wave 1 | Změna |
|---|---:|---:|---:|
| Main JS soubor, raw | 1 253 670 B | 420 788 B | −66,4 % |
| Main JS soubor, Vite gzip | 344,36 kB | 116,02 kB | −66,3 % |
| Celý počáteční eager JS graf, raw | 1 253 670 B | 847 766 B | −32,4 % |
| Celý počáteční eager JS graf, gzip | 344,36 kB | 240 392 B | přibližně −30,2 % |
| Hlavní CSS, raw | 196 007 B | 180,73 kB | −7,8 % |
| Produkční dynamické route importy | 0 | 13 | splněno |

Family Jump má navíc vlastní odložený CSS chunk 15,65 kB raw / 3,62 kB gzip. Celkový objem CSS se prakticky nezměnil; změnila se jeho kritická část při startu.

## Route registry

Zdroj pravdy je `src/routes/routeRegistry.ts`. Každá route deklaruje cestu, lazy loader, offline policy, typ shellu, přístup a fallback.

| Route | Offline | Shell | Přístup | Child fallback |
|---|---|---|---|---|
| `/` | dostupná | standard | všichni | `/` |
| `/calendar` | dostupná | standard | všichni | `/` |
| `/plan` | blokovaná | standard | dospělí | `/chores` |
| `/chores` | blokovaná | standard | všichni | `/` |
| `/activities` | blokovaná | standard | všichni | `/` |
| `/health` | blokovaná | standard | dospělí | `/more` |
| `/meals` | blokovaná | standard | všichni | `/` |
| `/shopping` | dostupná | standard | všichni | `/` |
| `/family` | blokovaná | standard | dospělí | `/more` |
| `/messages` | blokovaná | standard | všichni | `/` |
| `/more` | blokovaná | standard | všichni | `/` |
| `/reminders` | blokovaná | standard | všichni | `/` |
| `/family-jump` | dostupná | fullscreen | všichni | `/` |

`AppShell` už neobsahuje ruční řetězec `path === ...`. Fullscreen route se vykreslí před standardním shellem. Standardní route používají společný `RouteRenderer` a přístupný loading fallback s `FamilyMark`, stabilní minimální výškou a samostatným fullscreen layoutem.

Offline startup gate i UI capability matrix čtou stejná metadata z registru. Tím se odstranily tři původní, oddělené seznamy route pravidel.

## Chunking

Všechny top-level obrazovky jsou lazy, včetně Home, Calendar, Plan, Chores a Shopping. Rozhodnutí lazy-loadovat i Home udržuje jednotný kontrakt registru a odděluje 22,53 kB route kódu; shell při čekání zachová rozměry pomocí společného fallbacku.

Požadované těžké route mají vlastní dynamické chunky:

| Route | JS raw | JS gzip | Další odložené CSS |
|---|---:|---:|---:|
| Family Jump | 52,06 kB | 16,28 kB | 15,65 kB / 3,62 kB gzip |
| Messages | 61,41 kB | 15,44 kB | — |
| Meals | 22,07 kB | 5,85 kB | — |

Další samostatné route chunky: Activities 9,27 kB, Calendar 23,14 kB, Chores 14,50 kB, Family 14,54 kB, Health 4,71 kB, More 23,23 kB, Plan 4,85 kB, Reminders 18,07 kB, Shopping 16,60 kB a Today 22,53 kB.

## Analyzer a bundle guard

- `npm run build:analyze` vytvoří `dist/bundle-report.html` pomocí `rollup-plugin-visualizer`. Plugin je pouze vývojová závislost a neběží v normálním buildu.
- Vite generuje `dist/.vite/manifest.json`.
- `npm run check:bundle` ověří, že Family Jump, Messages a Meals jsou tři samostatné dynamické entry chunky, nejsou statickými importy main entry a jsou dosažitelné jako přímé dynamické route importy.
- Guard hlídá main file limitem 1 050 000 B raw / 310 000 B gzip a navíc celý eager graf limitem 950 000 B raw / 280 000 B gzip.
- `npm run build` spouští guard automaticky po produkčním buildu.
- Unit test guardu obsahuje regresní fixture, ve které se Messages vrátí do main souboru, a ověřuje selhání kontroly.

## Zachované navigační kontrakty

- Neznámá cesta se normalizuje na `/`.
- Direct refresh funguje pro všech 13 top-level route; `vercel.json` dál přepisuje `/(.*)` na `/index.html` bez redirectu.
- `navigateHref` zachovává query parametry a hash pro Messages i Reminders deep linky.
- `popstate` dál synchronizuje Back/Forward navigaci.
- Family Jump nepoužívá standardní header, bottom navigation ani create-record wizard.
- Offline dostupné zůstávají pouze Home, Calendar, Shopping a Family Jump.
- Child přístup a fallbacky zůstávají stejné jako před změnou.

## Ověření

- `npm run lint` — úspěch; pouze dříve existující warnings.
- `npm test` — 178 test souborů, 1 048 testů, vše prošlo.
- `npm run build` — úspěch včetně manifestu a bundle guardu.
- `npm run build:analyze` — úspěch, HTML report vytvořen.
- `npm run check:edge-functions` — součást finální validace.

Pro plný testovací běh na Windows byla opravena pouze přenositelnost existujícího kontraktního testu: URL cesty se nyní převádí přes `fileURLToPath`, místo skládání neplatné cesty `C:\C:\...`.

## Rizika a další kroky

- Provider graph nebyl v této wave měněn záměrně. Největší eager shared chunk `applyRealtimeUpdate` má 383 096 B raw / 109 207 B gzip a je důvodem, proč je celý eager graf větší než samotný main file. Jeho zmenšení patří do následující provider/data wave.
- První otevření každé route nyní obsahuje jeden síťový round-trip navíc. Hashované chunky jsou cachovatelné a během čekání se zobrazuje jednotný stabilní fallback.
- Route-level import může selhat při nekonzistentním deploymentu starého HTML a nových chunků. Stávající service-worker/deployment strategie se v této wave neměnila.
- Datové providery, Supabase lifecycle, realtime subscription logika, Calendar/Shopping repository, auth bootstrap, RLS a UX jednotlivých obrazovek zůstaly mimo rozsah změny.

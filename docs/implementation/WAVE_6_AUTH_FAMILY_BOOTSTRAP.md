# Wave 6 — auth/family bootstrap paralelizace a cached-validating stav

## Shrnutí

Startup rozhodnutí „kdo jsi a do jaké rodiny patříš“ bylo sériové: auth timeout → identity cache timeout → membership timeout. Cache navíc při zdravé síti nikdy nezrychlila render, protože se používala jen v error větvi. Auth timeout se mapoval na `session = null`, což vypadalo jako odhlášení.

Po této vlně běží cache read a membership query paralelně, validní scoped cache může otevřít shell dřív s explicitním `cached-validating` stavem, a neověřitelný auth stav je retryable chyba, ne přihlašovací obrazovka.

## Sériové hranice před a po

| Fáze | Před | Po |
|---|---|---|
| Auth session | 10 s | 10 s |
| Identity cache | 10 s, **až po** auth a **před** membership | 3 s, paralelně s membership |
| Membership | 10 s, až po cache | 10 s, startuje současně s cache |
| Sériové timeout hranice | **3** | **2** |
| Teoretická nejhorší cesta k rozhodnutí | ~30 s | ~20 s |

Rodinná fáze sama klesla z až 20 s (cache + membership) na 10 s (`max(3 s, 10 s)`).

Wall-clock hodnoty závisejí na zařízení a velikosti IndexedDB, takže — stejně jako ve Wave 4 — automatizovaný kontrakt měří **pořadí**, ne milisekundy: `useFamily.bootstrap.test.ts` ověřuje, že `from('members')` je zavoláno, zatímco cache promise ještě nedoběhla, a že zaseknutý cache read (promise, která nikdy neresolvuje) nebrání dosažení `resolved`.

## Stav při startu

| Scénář | Před | Po |
|---|---|---|
| Cold online, bez cache | loader → shell | beze změny |
| Warm online, validní cache | loader po celou dobu cache + membership | shell na cached identitě, jakmile doběhne IndexedDB read; badge „Aktualizuji“ do potvrzení |
| Slow online, validní cache | loader až do membership odpovědi | shell na cached identitě, validace na pozadí |
| Slow online, bez cache | loader | loader (beze změny) |
| Offline s cache | shell přes error větev | beze změny, plus rychlejší cesta k němu |
| Auth timeout | přihlašovací obrazovka (vypadá jako logout) | retryable chyba + odkaz na přihlášení |
| Account switch | scoped, ale provider state se recykloval | provider graf se remountuje na změnu scope |

## Auth: čtyři stavy místo dvou

`useSession()` vrací `status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'`, `authError` a `retry()`.

Rozhodující je rozdíl mezi „server odpověděl“ a „na server jsme se nedostali“:

- **odpověď bez session** (včetně `Invalid refresh token`, tedy vypršelý účet) → `anonymous` → přihlašovací obrazovka. Tohle zůstalo úmyslně beze změny; expirovaná session **je** potvrzené odhlášení a nesmí skončit v retry smyčce;
- **timeout nebo nedosažitelný endpoint** → `unavailable` → retryable chyba. Session zůstává `undefined`, tedy nerozhodnuto;
- **rejected promise** → `unavailable`.

Obrazovka `authError` nabízí retry a druhotný odkaz „Přejít na přihlášení“, aby uživatel nemohl uvíznout za tlačítkem retry, pokud je auth trvale nedostupný.

## Family: paralelní čtení a cached-validating

```text
setState(loading)
├─ cachePromise      = loadFamilyIdentity(userId)        (3 s budget)
└─ membershipPromise = members.select(...).maybeSingle() (10 s budget)

cachePromise → pokud stále 'loading' a userId sedí → status 'cached-validating'
membershipPromise → přepíše stav vcelku (autorita serveru)
```

Pravidla autority:

| Výsledek serveru | Stav | Member |
|---|---|---|
| úspěch s řádkem | `resolved` | serverový řádek (přepíše cached) |
| úspěch bez řádku | `resolved` | `null` → onboarding, cached se zahodí |
| permission/auth chyba | `error` | `null` — cache **neodemkne** data |
| network outage + cache | `resolved` | cached, `connectionError` nastaven |
| network outage bez cache | `error` | `null` |

Chybová větev na cache čeká (`await cachePromise`), takže o offline fallbacku nerozhoduje pořadí doběhnutí.

## Bezpečnost scope

- cache je klíčovaná `userId`, takže se nikdy nečte záznam jiného uživatele;
- `cached-validating` se publikuje jen když `current.userId === userId` a stav je stále `loading`;
- routing stav propustí cached identitu jen s živou session a shodným `session.user.id`;
- `requestVersion` zahazuje odpovědi patřící předchozímu `userId`;
- **nové:** `AppDataProviders` má `key={userId:familyId}`. Změna účtu nebo rodiny celý datový graf odmountuje a postaví znovu, takže žádný provider nemůže dorenderovat stav načtený pro předchozí scope. Stejný scope (např. potvrzení cached identity serverem) remount nezpůsobí a rozběhnuté fetche přežijí.

## UI

`FamilyValidatingBadge` v hlavičce, viditelný pouze ve stavu `cachedFamilyValidating`. Vizuálně stejný tichý dot+label jako realtime badge, zmizí sám po potvrzení. Aplikace je použitelná, ale netvrdí, že jsou data už sesouhlasená. Stav je vlastní jednohodnotový context, takže nererenderuje nic dalšího.

## Opravený latentní bug: `isNetworkUnavailableError`

Funkce četla zprávu jen z `error instanceof Error`. Supabase ale vrací dva tvary: `AuthError` (potomek `Error`) a `PostgrestError` (**prostý objekt** s polem `message`). Pro databázové chyby se tedy stringifikoval `"[object Object]"` a všechna pravidla nad zprávou byla mrtvá — offline fallback membership dotazu fungoval výhradně přes `navigator.onLine`.

Nyní se `message` čte i z objektových tvarů. Guardy proti záměně s autorizační chybou (400/401/403, `permission`, `jwt`, `rls`, …) běží nad stejnou zprávou, takže permission chyba dál nikdy neprojde jako výpadek sítě. Dotčená jsou tři volání: `useFamily`, `useSession` a Family Jump sync.

## Testované scénáře

`useFamily.bootstrap.test.ts` (11), `useSession.test.ts` (+5), `authRoutingState.test.ts` (+5), `App.authRouting.test.tsx` (+11), `networkStatus.test.ts` (5), `authBootstrapContract.test.ts` (9):

- membership query startuje, aniž by cache doběhla; mezi oběma čteními není `await`;
- zaseknutá cache nezdrží potvrzenou odpověď;
- cached identita otevře shell a je označená jako nevalidovaná;
- rychlá serverová odpověď nezpůsobí `cached-validating` bliknutí;
- pozdní cache nepřepíše potvrzený výsledek;
- potvrzené prázdné členství zahodí cached identitu a vede na onboarding;
- permission chyba nikdy nenechá cached data na obrazovce;
- výpadek sítě cached identitu zachová — a to i když cache doběhne až po chybě;
- odpověď patřící předchozímu `userId` je zahozena;
- auth timeout je `unavailable` + retryable, retry projde celý bootstrap znovu;
- vypršelý refresh token zůstává potvrzené `anonymous`;
- cached identita se neotevře bez session ani pro jiného uživatele;
- účet A → účet B remountuje provider graf; stejný scope neremountuje;
- managed child: nelinkovaný, linkovaný, linkovaný na cached identitě, expirovaná session;
- `PostgrestError` se rozpozná jako výpadek sítě, autorizační odpověď nikdy;
- BOOT logy neobsahují e-mail, jméno, `user_id` ani member ID.

## Validace

```
npm run lint                 ✓ (pouze předchozí warningy)
npm test                     ✓ 194 souborů / 1 164 testů
npm run build                ✓ + route chunk guard passed
npm run check:edge-functions ✓
git diff --check             ✓
```

Main entry 336 868 → **339 142 B raw** (100 197 → 100 747 B gzip) kvůli novému badge, contextu a stringům. V rozpočtu.

`npm run test:db` nebyl spuštěn — vlna nemění RLS, membership schema ani žádnou RPC; lokální Supabase stack nebyl dostupný.

## Browser QA

Aplikace byla načtena na lokálním dev serveru. Bootstrap proběhl `BOOT 1 auth init → BOOT 2 auth ready → BOOT 7 routing → BOOT DONE` a skončil na přihlašovací obrazovce bez chyb v konzoli.

**Omezení:** relace nebyla přihlášená, takže ověřuje pouze potvrzenou `anonymous` cestu — tedy tu, kterou tato vlna měnila nejcitlivěji. Neověřeno naživo: cached-validating shell, badge, account switch a managed child. Tyto cesty pokrývají deterministické testy výše; před nasazením stojí za manuální průchod.

## Záměrně beze změny

- vizuál login/register obrazovek;
- onboarding business flow;
- RLS a membership schema;
- interní chování feature providerů;
- Calendar/Shopping mutation queues;
- 10s auth budget.

## Follow-up pro Wave 7

- `cached-validating` je nyní pozorovatelný stav; render/CSS cleanup může měřit time-to-shell odděleně pro cached a cold cestu;
- badge sdílí třídy s `realtime-status-badge`; pokud Wave 7 sáhne na header, stojí za to je sjednotit do jedné komponenty se stavovým vstupem.

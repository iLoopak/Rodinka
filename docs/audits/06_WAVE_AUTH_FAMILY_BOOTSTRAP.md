# Rodinka — Wave 6: auth/family bootstrap paralelizace a cached-validating stav

Tato vlna zasahuje do kritického startup routing flow. Implementuj ji až po stabilizaci routingu, realtime diagnostiky a offline/cache auditních závěrů.

Cílem je odstranit sériové čekání:

```text
auth timeout
→ identity cache timeout
→ membership timeout
```

a využít bezpečně scoped cached identity pro rychlejší shell bez rizika zobrazení dat jiného uživatele.

## Hlavní problémy

- `useFamily` awaituje local identity cache a teprve potom spouští membership query.
- Cache se při zdravé, ale pomalé síti nepoužije pro dřívější render.
- Auth timeout se může mapovat na anonymous stav místo explicitního retryable error.
- Teoretická nejhorší rozhodovací cesta je velmi dlouhá.
- User switch a managed child flow vyžadují striktní scope izolaci.

## Cíle

1. Spustit scoped cache load a membership validation paralelně.
2. Přidat explicitní `cached-validating` routing state.
3. Rozlišit auth timeout od potvrzeného anonymous session.
4. Zachovat bezpečnost při account switch.
5. Zachovat offline fallback pouze pro skutečný network outage.
6. Zkrátit time-to-shell při validní cache.

## Návrh state machine

Rozšiř routing model explicitně, například:

```ts
type AuthRoutingStatus =
  | 'authLoading'
  | 'authError'
  | 'unauthenticated'
  | 'cachedFamilyValidating'
  | 'userDataLoading'
  | 'userDataError'
  | 'authenticatedWithoutFamily'
  | 'authenticatedWithFamily'
```

Přesné názvy přizpůsob existujícím typům.

### Auth session

Musí být rozlišeno:

- unresolved,
- confirmed anonymous,
- authenticated,
- retryable auth timeout/error.

Timeout nesmí automaticky vypadat jako logout, pokud nelze potvrdit anonymous session.

### Family cache

Cached family identity může být použita pouze pokud:

- je scopeovaná aktuálním `session.user.id`,
- schema je validní,
- není explicitně invalidovaná,
- neexistuje permission/auth chyba,
- account switch cleanup proběhl.

Cached identity může otevřít limited shell nebo cached-validating stav při:

- pomalé membership validaci,
- skutečném offline stavu,
- retryable network timeoutu.

Nesmí otevřít data při:

- `permission-denied`,
- expired/invalid session,
- membership confirmed empty,
- jiném user ID,
- corrupt cache.

## Paralelizace

Po získání authenticated session spusť současně:

- scoped cache read,
- server membership validation.

Výsledek zpracuj deterministicky:

1. server success má autoritu,
2. confirmed empty membership vede k onboardingu,
3. permission/auth error cache nesmí odemknout,
4. network unavailable může použít validní scoped cache,
5. pomalý server může umožnit cached-validating shell s jasnou background validací,
6. pozdější server mismatch musí bezpečně přepnout scope bez flashnutí cizích dat.

## UI

Cached-validating stav má být nenápadný.

Možnosti:

- zobrazit shell s cached identity a malou synchronizační indikací,
- nebo zobrazit rychlejší family-aware loading state.

Nevytvářej falešný dojem plně synchronizovaných dat.

Při validation failure nabídni retry.

## Account switch

Povinně otestuj:

```text
user A
→ validní cache
→ logout
→ user B login
→ pomalá síť
```

Uživatel B nesmí ani na jeden render vidět:

- family name uživatele A,
- members uživatele A,
- avatar/hero URLs uživatele A,
- offline Calendar/Shopping data uživatele A.

## Managed child

Zachovej:

- linked managed child,
- unlinked child screen,
- child route capabilities,
- expired managed session,
- parent/child account switch.

## Testy

Použij fake timers a explicitní race testy.

1. cache a membership se spouštějí paralelně,
2. fast server success,
3. slow server + valid cache,
4. slow server + no cache,
5. auth timeout je retryable error, ne anonymous,
6. confirmed anonymous zobrazuje login,
7. permission error neodemkne cache,
8. network offline použije validní scoped cache,
9. confirmed empty membership přepne na onboarding,
10. cached membership mismatch se bezpečně nahradí,
11. account A → logout → B bez data flash,
12. managed child flows,
13. stale in-flight request starého user ID je ignorován,
14. retry po timeoutu,
15. bootstrap logging neobsahuje PII.

## Měření

Zapiš before/after:

- time do first family-aware renderu s validní cache,
- time do confirmed authenticated shell,
- počet sériových timeout boundaries,
- cold online,
- warm online,
- slow online,
- offline cached,
- account switch.

## Dokumentace

Vytvoř:

```text
docs/implementation/WAVE_6_AUTH_FAMILY_BOOTSTRAP.md
```

## Co neměnit

- login/register vizuál,
- onboarding business flow,
- RLS,
- membership schema,
- feature provider internals,
- Calendar/Shopping mutation queues.

## Acceptance criteria

- Cache read a membership validation nejsou zbytečně sériové.
- Auth timeout se nezobrazuje jako potvrzené odhlášení.
- Validní scoped cache může zrychlit family-aware startup.
- Permission/auth chyba nikdy neodemkne cached family data.
- Account switch nemůže zobrazit data předchozího účtu.
- Offline a managed-child routing zůstávají funkční.

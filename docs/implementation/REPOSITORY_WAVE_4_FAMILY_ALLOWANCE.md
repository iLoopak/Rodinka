# Repository Wave 4 — Family members/settings a allowance

Audit: [`docs/audits/REPOSITORY_DATA_LAYER_AUDIT.md`](../audits/REPOSITORY_DATA_LAYER_AUDIT.md)
Navazuje na: [Wave 3](REPOSITORY_WAVE_3_REMINDERS.md)

Rozděleno do dvou commitů podle zadání vlny.

---

## Část A — Family members a settings

### Before

| Co | Kde |
| --- | --- |
| `.from('members')` ×3 | `FamilyMembersContext`, `useFamilyMembers`, `useFamily` |
| `.rpc()` ×6 | remove/restore/permanently_delete/create_invite/update_member_profile/family_member_emails |
| `.rpc('create_family')`, `.rpc('redeem_invite')` | **`OnboardingScreen.tsx`** — jediný přímý přístup z komponenty v celé aplikaci |
| `.from('families')` + storage ×6 | `FamilySettingsContext` |
| storage `member-avatars` ×5 | rozprostřeno přes 3 soubory |

**38 volání.** Podepisování, upload a mazání obrázků bylo ve čtyřech souborech, každý s vlastním ošetřením chyb a vlastní představou o životnosti URL.

### After

```text
src/features/family/
  domain/
    familyMappers.ts    — MEMBER_COLUMNS, FAMILY_SETTINGS_COLUMNS, mapMember, mapFamilySettings
    familyErrors.ts     — FamilyError s AppErrorCode
  data/
    familyMediaStorage.ts                — jediný vlastník obou bucketů
    familyRepository.ts                  — 3 rozhraní
    supabaseFamilyRepository.ts          — members + settings
    supabaseFamilyOnboardingRepository.ts — samostatně, viz bundle
```

**Jeden seznam sloupců pro `members`.** Byl psaný na čtyřech místech a jedno z nich vynechávalo `status` — člen načtený tou cestou se choval jako aktivní bez ohledu na to, jestli byl odebrán.

**Storage adapter.** `familyMediaStorage` vlastní `member-avatars` i `family-hero-images`. Obě životnosti signed URL leží vedle sebe, protože `signedUrlMaxAgeMs` z nich odvozuje max age query cache — cachovaný payload tak vždy vyprší dřív než URL uvnitř.

**Targeted updates.** `updateProfile` dočte jednoho člena místo celého rosteru. Realtime řádek repository podepíše, než ho předá — jinak by avatar zmizel do dalšího plného refreshe.

**`OnboardingScreen` už nemá přímý přístup.** Byl to poslední v aplikaci.

### Dvě chyby, které jsem při tom zavedl a odchytil

1. Po přesunu RPC v join handleru zůstalo `if (error)`, což už nečetlo zachycenou chybu, ale **stavovou proměnnou komponenty** — neúspěšné připojení by zavolalo `onDone()`.
2. Detekce neplatného invite kódu porovnávala anglický text zprávy. Ten se po zabalení do `FamilyError` ke komponentě nedostane, takže by tiše přestala fungovat. Nově se rozhoduje podle doménového kódu (`conflict`), který refinement produkuje.

### Regrese, kterou odhalil vlastní test

`classifyAppError` neuměl rozpoznat **už klasifikovanou** doménovou chybu. `FamilyError` má message `family:family.listMembers:permission-denied`, což nesedí na žádný raw Postgres pattern → vracelo se `unknown` → `unknown` je retryable → **stale fallback query cache začal znovu servírovat cached family data po RLS odmítnutí**. Tedy přesně oprava P0-6 z offline batche, poražená vlastním wrapperem.

`classifyAppError` nyní zkratuje na kódu, kterému už rozumí. Test `useFamilyMembers.permission.test.tsx` to zachytil.

### Bundle

Eager rozpočet zvýšen z 232 KB na 234 KB gzip. Family contexty jsou na startovní cestě, takže jejich datová vrstva taky. `SupabaseFamilyOnboardingRepository` je proto v samostatném modulu — jinak by `OnboardingScreen` vtáhl do startovního grafu realtime helper a všechny mappery.

Rozpočet jsem zvedal nerad; guard existuje právě proti tomuhle. Zvýšení je cena za vrstvu, ne za nový produktový kód.

---

## Část B — Allowance

### Before

| Co | Kde |
| --- | --- |
| `.from('allowance_plans')`, `.from('allowance_cycles')` | `useAllowancePlans` |
| `.from('allowance_ledger')` | `useAllowanceLedger` |
| `.rpc()` ×5 | `AllowanceContext` — payout, save/delete plan, credit/skip cycle |

**8 volání.** Částky se konvertovaly `Number()` ad hoc na dvou místech a jinde vůbec.

### After

```text
src/features/allowance/
  domain/allowanceMappers.ts       — sloupce, mappery, money(), balancesFromLedger()
  data/allowanceRepository.ts      — rozhraní
  data/supabaseAllowanceRepository.ts — implementace + AllowanceError
```

**Ledger je append-only i v rozhraní.** Není tam update, delete ani generický insert. Každý zápis má doménový význam (payout, settled cycle), takže důvod pohybu peněz je vždy zaznamenaný spolu s ním.

**Settlement zůstává v RPC.** `credit_monthly_allowance` zapisuje ledger entry i cycle row v jedné transakci. Rozdělit to na dva klientské zápisy by znamenalo špatný zůstatek rodiny pokaždé, když druhý selže. Zadání to explicitně vyžaduje.

**`money()` na jednom místě.** Postgres `numeric` chodí jako string; zapomenutá konverze udělá ze součtu konkatenaci řetězců, což není chyba, které by si někdo všiml.

**Idempotence settlementu.** Druhý pokus o credit/skip se mapuje na `conflict`, nikdy na retryable chybu — jinak by rodina dostala zaplaceno dvakrát.

**Nullable `member_id`.** Ledger entry přežije člena, kterému patřila. Mapper to respektuje a `balancesFromLedger` takové položky nepočítá do žádného zůstatku.

---

## Dopad na guard

```text
po Wave 3:  82 volání, family 38, allowance 8
po části A: 46 volání, family 2
po části B: 38 volání, allowance 0
```

Zbývá: **messages 30** (mimo plán vln, viz audit §9), chores 3, shopping 2, family 2, medical 1.

Zbývající 2 ve family jsou `useFamily.ts` (bootstrap identity — čte `members` před tím, než existuje scope) a `useChildAccounts.ts`. Obojí je mimo hranici, kterou tato vlna zaváděla; `useFamily` navíc má vlastní timeout a cache logiku svázanou s bootem.

## Testy

| Soubor | Co pokrývá |
| --- | --- |
| `features/family/domain/familyMappers.test.ts` | **chybějící status = active**, avatar_url se nevymýšlí z řádku, removal audit pole, jediný seznam sloupců, spent invite → conflict, guarded role transition → permission-denied, **wrapped error zůstane klasifikovaný přes `classifyAppError`** |
| `features/allowance/domain/allowanceMappers.test.ts` | **numeric jako string**, neparsovatelná částka → 0 ne NaN, nesettlovaný cyklus vs. settled na nulu, součet zůstatku, **entries po odebraném členovi nepatří do žádného zůstatku** |
| `hooks/useFamilyMembers.permission.test.tsx` | beze změny — a právě on odhalil regresi popsanou výše |

## Validace

| Příkaz | Výsledek |
| --- | --- |
| `npm run lint` | ✅ 0 chyb |
| `npm test` | ✅ 226 souborů, 1381 testů |
| `npm run build` | ✅ včetně `check:bundle` (rozpočet zvýšen, viz výše) |
| `npm run check:data-access` | ✅ 38 známých volání (z 82) |
| `npm run test:db` | ⚠️ nespuštěno — Docker nedostupný; vlna nemění migrace ani RLS |

## Zbývá

- `FamilyAccountLinkingService` zadání navrhuje, ale child-account linking dnes žije v `src/lib/childAccountAdmin.ts`, což už je oddělená infrastrukturní vrstva se schválenou výjimkou. Nový service by ji jen obalil.
- Chore reward → allowance ledger application service: `src/application/approveChoreCompletion.ts` už existuje a koordinaci dělá serverové RPC. Nic k přidání.
- `useFamily.ts` a `useChildAccounts.ts` (2 volání) — viz výše.

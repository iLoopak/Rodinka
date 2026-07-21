# Rodinka — Repository Wave 4: Family members/settings a allowance

Implementuj poslední plánovanou P1 repository vlnu.

Rozděl práci do dvou logických commitů nebo samostatných PR, pokud scope začne být velký:

1. Family members + family settings.
2. Allowance.

Nekombinuj je do jednoho god repository. Sdílejí scope a některé workflows, ale jde o rozdílné domény.

## Část A — Family members a family settings

### Cíl

Centralizovat:

- member list,
- member profile mutations,
- avatar path/signed URL mapping,
- current member identity,
- family settings,
- family hero/logo metadata,
- child-account/member linking workflows,
- member email visibility RPC.

### Repository hranice

Preferuj oddělení:

```ts
FamilyMembersRepository
FamilySettingsRepository
FamilyAccountLinkingService
```

Doménové operace:

- list members,
- create/update/archive member,
- update member profile/photo metadata,
- load/update family settings,
- resolve signed media,
- link/unlink managed child account,
- load authorized parent/member contact details.

Storage upload může mít samostatný adapter.

### Bezpečnost

Zachovej:

- RLS,
- role/capabilities,
- parent vs. child visibility,
- sibling direct-chat privacy,
- archivované/odpojené účty,
- signed URL scoping.

UI nesmí dostat raw storage path/error, pokud nepotřebuje.

### Targeted updates

- edit člena má aktualizovat konkrétního člena,
- změna family settings nemá reloadovat celý provider graph,
- avatar update má invalidovat pouze příslušnou signed URL/cache entry,
- realtime echo musí být deduplikovaný.

## Část B — Allowance

### Cíl

Centralizovat:

- plans,
- cycles,
- ledger,
- child balance/summary,
- reward/penalty workflows,
- případné napojení na chore approval.

### Repository hranice

Příklad:

```ts
AllowanceRepository
AllowanceSettlementService
```

Doménové operace:

- load child allowance summary,
- create/update plan,
- list ledger page/range,
- add adjustment,
- settle cycle,
- apply approved chore reward, pokud toto workflow existuje.

Nevystavuj UI přímé inserts do ledgeru bez doménového významu.

Ledger má být append-oriented, pokud to odpovídá současnému modelu.

## Application services

Použij service pro workflow přes Chores + Allowance:

```text
approve chore
→ validate reward eligibility
→ create ledger entry idempotently
→ update completion state
```

Pokud atomicita vyžaduje RPC, použij cílené serverové RPC a contract test.

Nedělej dva nezávislé klientské writes bez rollback strategie.

## Error mapping

Family:

- member not found,
- duplicate linked account,
- permission denied,
- storage upload failed,
- invalid role/capability transition.

Allowance:

- plan conflict,
- cycle closed,
- duplicate reward,
- invalid amount,
- permission denied,
- transaction failed.

## Testy

### Family

1. row/domain mappers,
2. member targeted update,
3. avatar signed URL invalidation,
4. settings targeted update,
5. parent/member email authorization,
6. child account link/unlink,
7. account switch scope isolation,
8. realtime dedupe.

### Allowance

1. plan/cycle/ledger mappers,
2. targeted plan update,
3. append ledger,
4. duplicate chore reward idempotency,
5. approve chore transaction failure,
6. child balance summary,
7. permission boundaries,
8. no full reload after simple adjustment.

### Společné

- žádné přímé Supabase cally v UI/contextu,
- data-access guard,
- Home/Family/Chores parity.

## Dokumentace

Vytvoř:

```text
docs/implementation/REPOSITORY_WAVE_4_FAMILY_ALLOWANCE.md
```

Odděl v dokumentu before/after pro obě domény.

## Co neměnit

- vizuální redesign Family/Profile/Allowance UI,
- role model bez konkrétního důvodu,
- child-account schema bez nutnosti,
- ledger history destruktivním přepisem,
- Shopping/Calendar/Meals repositories.

## Acceptance criteria

- Family members, settings a allowance mají oddělená doménová repositories.
- Cross-domain chore reward workflow má application service/RPC s idempotency.
- Simple update nespouští full domain reload.
- Storage, RPC a subscriptions mají jednoznačného vlastníka.
- UI/context neobsahují přímé Supabase cally.

# Wave 4 — Calendar startup deduplikace a odložený online refresh

## Shrnutí

Calendar offline repository nyní při mountu načte a okamžitě publikuje pouze scope-safe IndexedDB snapshot a durable mutation queue. Nespouští vlastní desetidílný Supabase snapshot ani široký realtime channel v kritické startup cestě.

Online snapshot se průběžně skládá z již načtených feature providerů. Pokud některý provider zůstane nedostupný, existuje po 4 sekundách remote fallback; otevření Calendar nebo ruční refresh jej může spustit okamžitě. Pending Calendar mutace jsou vždy aplikované až nad server/provider daty, takže starší provider stav lokální položku nepřepíše.

## Povinný ownership audit před změnou

| Snapshot entita | Existující vlastník | Dataset úplný pro Calendar | Pending lokální změny | Reuse do snapshotu | Samostatný Calendar fetch |
|---|---|---|---|---|---|
| members | `FamilyMembersProvider` | ano, celý family dataset; signed avatar URL se před persistencí odstraní | ne | ano | ne |
| chores | `ChoresProvider` | ano, superset Calendar range | Calendar queue může obsahovat lokální create | ano, queue se aplikuje až nad provider daty | ne |
| chore completions | `ChoresProvider` | ano, celý family dataset | ne | ano | ne |
| activities | `ActivitiesProvider` | ano, superset Calendar range | Calendar queue může obsahovat lokální create | ano, queue se aplikuje až nad provider daty | ne |
| activity participants | `ActivitiesProvider` | ano, mapované do `participant_ids` | ne | ano jako součást activities | ne |
| medical records | `MedicalProvider` | ano, celý family dataset | ne | ano | ne |
| meal plan entries | `MealsProvider` | ano, celý family dataset | ne | ano po dokončení plan-entry loadu | ne |
| occurrence overrides | `OccurrenceAssignmentsProvider` | ano | krátký optimistic provider stav | ano; rollback provideru se znovu propíše | ne |
| series assignment history | `OccurrenceAssignmentsProvider` | ano | ne | ano | ne |
| participant history | `OccurrenceAssignmentsProvider` | ano | ne | ano | ne |

Calendar snapshot navíc obsahuje `allowancePlans`. Úplný dataset poskytuje `AllowanceProvider`. `allowance_plans` realtime signál byl přesunut do jeho existujícího channelu; změna vyvolá refresh canonical joined shape včetně requirements.

## Startup lifecycle po změně

1. Repository načte paralelně IndexedDB snapshot a mutation queue.
2. Publikuje `ready`, usable data, sync metadata a pending overlay.
3. Home ani Calendar children nečekají na remote snapshot.
4. Úspěšně načtené feature providery předávají jednotlivé domény repository.
5. Po přijetí všech deseti domén se snapshot scope-safe uloží a stav přejde na `synced`.
6. Čtyřsekundový fallback se zruší.
7. Pokud domény kompletní nejsou, fallback provede původní full snapshot fetch mimo first-render path.

`requestIdleCallback` spouští reconciliation po uvolnění hlavního vlákna a vždy existuje čtyřsekundový timeout fallback. Calendar route volá prioritní reconciliation po publikování lokálního snapshotu. Opakované priority, retry a auto sync sdílejí jediný `syncPromise`.

## Realtime ownership po změně

Calendar-wide `family:<id>:calendar-offline` channel byl odstraněn. Tabulky vlastní feature channels:

| Tabulka | Jediný vlastník |
|---|---|
| members | FamilyMembersProvider |
| chores, chore_completions | ChoresProvider |
| activities, activity_participants | ActivitiesProvider |
| medical_records | MedicalProvider |
| meal_plan_entries | MealsProvider |
| occurrence_overrides, series_assignment_history, activity_participant_history | OccurrenceAssignmentsProvider |
| allowance_plans | AllowanceProvider |

Provider state je současně zdrojem online UI a snapshot writeru. Calendar repository už neotevírá druhou subscription jen kvůli offline kopii.

## Queue a scope bezpečnost

- `apply_calendar_mutation` a operation ID zůstávají beze změny;
- pending/syncing/failed queue se dál persistuje před síťovým pokusem;
- provider update nahrazuje pouze serverovou doménu, pending overlay se aplikuje následně;
- úspěšná mutace stále provede canonical remote snapshot pro potvrzení server výsledku;
- manual retry během auto sync používá stejný in-flight promise;
- update s jiným `familyId` repository odmítne;
- user/family storage key zůstává `userId:familyId`;
- offline start nevytváří timer ani Supabase snapshot request.

## Before / after

| Metrika | Před | Po |
|---|---:|---:|
| Cold-start Supabase operace z auditu | přibližně 34 | přibližně 24 |
| Calendar-specific startup reads | 10 | 0 v běžné provider-complete cestě |
| Calendar fallback reads | okamžitě 10 | 0; nebo 10 až po 4 s při degraded/incomplete providers |
| Aktivní realtime channels | 11 | 10 |
| Calendar duplicate table subscriptions | 10 tabulek | 0 |
| Time do usable Home/Calendar snapshotu | IDB + realtime setup + full remote sync lifecycle | pouze IDB load; remote není v promise kritické cesty |
| Background reconciliation | součást startup `start()` | provider-complete okamžik nebo idle callback; timeout fallback nejpozději od 4 000 ms |

Wall-clock čas závisí na zařízení a velikosti IndexedDB. Automatizovaný kontrakt proto měří pořadí: `start()` vrátí usable uložený snapshot při `fetchSnapshot` count 0 a remote fallback nesmí nastat před 4 000 ms.

## Testované scénáře

- stored snapshot před online reconciliation;
- Home/start promise nečeká na full remote snapshot;
- provider-complete cesta zruší fallback bez remote readu;
- Calendar route priority spustí právě jeden fallback;
- degraded backend zachová usable snapshot;
- pending offline item přežije provider update;
- reload zachová queue;
- reconnect aplikuje mutation právě jednou;
- manual retry a auto sync se deduplikují;
- retryable remote failure zachová fallback intent;
- user/family scope zůstává izolovaný;
- offline start neprovádí online fetch;
- Calendar-wide realtime channel neexistuje a všechny tabulky mají feature ownera.

## Záměrně beze změny

- Calendar UI kromě prioritizace refresh při otevření;
- mutation RPC, operation IDs a durable queue schema;
- Shopping repository;
- Messages, auth a family bootstrap;
- databázové schema;
- recurrence business logika.

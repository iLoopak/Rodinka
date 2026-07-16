# Repository architecture

Rodinka's feature data flow is:

```text
Component
  ↓
Feature context / application hook
  ↓
Repository interface
  ↓
Repository implementation
  ├── IndexedDB
  ├── Mutation queue
  ├── Supabase
  └── Realtime
```

## Responsibilities

Repositories own persistence and synchronization details: Supabase selects, inserts, updates, RPC calls, row-to-domain mapping, domain-to-row payloads, IndexedDB access, durable mutation queues, and feature-specific Realtime row reconciliation.

Feature contexts own React concerns: state exposure, loading and error presentation, provider composition, UI-facing selectors, memoization, and orchestration after a repository mutation has completed.

Domain utilities own pure business logic such as recurrence projection, chore state calculations, reminder draft generation, and display-oriented derivations. Repositories should call mapping utilities but should not duplicate those calculations.

Application services own explicit user workflows that span repositories. They coordinate repositories after transactional server-side work while keeping cross-domain coupling visible.

## Repository map

- `src/repositories/shared`: structured repository errors, Supabase helper types, and shared Realtime adapter exports.
- `src/repositories/shopping`: formal repository entry points for the existing offline-first shopping repository, IndexedDB adapter, durable mutation queue, sync, and Realtime integration.
- `src/repositories/medical`: `createMedicalRepository`, which owns medical record loading, creation, update payload mapping, and medical Realtime mapping.
- `src/repositories/chores`: `createChoresRepository`, which owns chore mutations, completion RPCs, approval/rejection RPCs, and incremental chore/completion Realtime mapping.
- `src/application/approveChoreCompletion.ts`: example application-service boundary for chore approval plus caller-provided reconciliation.

The remaining family, activities, meals, allowance, occurrence-assignment, and reminder contexts are approved migration follow-ups. They should follow the same explicit, domain-oriented repository style rather than a generic CRUD base class.

## Realtime ownership

Repositories that expose Realtime subscribe through `createRealtimeSubscription` and map raw rows before the context sees them. Simple table changes are applied incrementally with `applyRealtimeInsert`, `applyRealtimeUpdate`, and `applyRealtimeDelete`. Complex transactional RPCs may still trigger targeted reconciliation in the context or an application service.

## Offline repositories

Shopping is offline-first. Its repository owns IndexedDB snapshots, queued mutations, optimistic local writes, pending item markers, sync status, retry behavior, Supabase reconciliation, and Realtime-triggered sync. Online-only repositories should stay simpler until a feature has an offline requirement.

## Adding a repository

1. Create a feature directory under `src/repositories/<feature>`.
2. Define a small domain-oriented interface where it improves tests.
3. Inject `familyId`, `userId`, member identity, Supabase client, clock, and UUID generation instead of reading hidden global state.
4. Centralize row selection and mapping in the repository or a feature mapper.
5. Return domain models or semantic results; do not leak table names or RPC names to React code.
6. Normalize failures with `RepositoryError` and let contexts translate error codes to localized copy.
7. Add tests for mapping, payload construction, Realtime row handling, and any offline queue behavior.

## Approved direct-Supabase exceptions

Direct Supabase calls are still acceptable in infrastructure boundaries: authentication, session tracking, service-worker/push registration, and onboarding bootstrap flows. These are not feature persistence contexts and generally wrap Supabase platform behavior rather than domain data access.

## Testing conventions

Repository tests should use small typed fakes for Supabase, local stores, queues, clocks, and UUID generation. Test repository public contracts rather than private implementation details. Context tests should verify contexts call repositories and expose snapshots/errors rather than mocking every internal query.

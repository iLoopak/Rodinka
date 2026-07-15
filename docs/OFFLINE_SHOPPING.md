# Offline-first shopping architecture

The shopping list uses IndexedDB as its local source of truth. React reads and writes through `ShoppingRepository`; shopping components do not call Supabase directly.

## Data flow

1. The repository loads the last local snapshot and durable mutation queue from IndexedDB.
2. User actions update the local snapshot immediately and append or compact a queued mutation.
3. In the background, queued mutations are sent to the idempotent `apply_shopping_mutation` database function.
4. The latest server snapshot is downloaded and merged with any local mutations created during synchronization.
5. Supabase Realtime starts the same non-blocking synchronization when another household member changes the list.

IndexedDB stores active and purchased items, common-item templates, category settings, the last successful synchronization time, the mutation queue, and the last verified family identity needed to reach the list after an offline restart.

## Conflict behavior

- Creates keep their client-generated UUID. The server reuses the existing normalized-name merge rules.
- Purchase updates are applied in server arrival order, then the newest server snapshot is downloaded.
- A delete removes the server item; a later update of the missing item cannot recreate it.
- Server ordering is authoritative after synchronization. Pending local reorders are reapplied until uploaded.
- Idempotency records make retrying an acknowledged mutation safe, including quantity-merging creates.

## Reusing the foundation

Future offline modules should provide their own typed local records and domain-specific conflict rules while reusing the same boundaries: local store, durable mutation queue, repository, background synchronizer, and Realtime adapter. UI code should only subscribe to a repository snapshot and invoke repository commands.

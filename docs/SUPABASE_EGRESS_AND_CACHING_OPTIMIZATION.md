# Supabase egress and caching optimization audit

## Current excessive-traffic sources identified

- App bootstrap loaded the authenticated member through `useFamily`, then `FamilyMembersProvider` independently loaded the full `members` table for the same family. That duplicated member/profile metadata on each app start and after provider remounts.
- `useFamilyMembers` requested signed avatar URLs every refresh even when `avatar_path` had not changed. Signed URL responses are smaller than images, but they still add Supabase Storage egress and are easy to trigger by navigation/remounts.
- `FamilySettingsProvider` loaded the single `families` row and generated a signed hero URL on every mount. This is stable data and should usually be reused for tens of minutes.
- Calendar offline sync already avoids full-history loads by using a bounded snapshot, but the current snapshot is still broad: chores, completions, activities, medical records, meals, allowance plans, overrides, assignment history, participant history, and members are all fetched together.
- Shopping has the strongest existing offline implementation: an IndexedDB-backed repository and sync queue. Its remaining extra request is `meal_ingredients`, which currently refreshes alongside the shopping repository.
- The service worker caches same-origin app shell and static assets only; it does not cache authenticated Supabase API responses in shared Cache Storage, which is correct. No unsafe shared authenticated response caching was found.
- Realtime is already wrapped by shared helper modules, but providers still own per-domain subscriptions. Stable data such as family settings should use long-lived cached reads and targeted realtime patches rather than full refreshes.

## Implemented centralized cache

Added `src/queryCache.ts`, a small app-level query cache with:

- Stable family-scoped keys via `familyQueryKey(entity, familyId, ...parts)`.
- Sensible entity TTL constants: `stable` 45 minutes, `moderate` 10 minutes, `frequent` 1 minute, and 24-hour garbage/fallback age.
- In-memory deduplication for concurrent and repeated requests.
- Optional IndexedDB persistence in `rodinka-query-cache`, versioned with schema version `1`.
- Scope keys that include authenticated user ID and family ID when available.
- Development-only instrumentation logging query name, table/RPC label, estimated JSON payload bytes, request duration, cache hit/miss, stale fallback, and refetch reason. The log never prints record contents.

## Entity caching strategy

| Entity | Key shape | Stale time | Persistence | Notes |
| --- | --- | ---: | --- | --- |
| Family settings | `['family', familyId, 'settings']` | 45 minutes | IndexedDB | Single row plus signed hero URL. Invalidated after settings mutations. |
| Members | `['family', familyId, 'members']` | 45 minutes | IndexedDB | Includes signed avatar URLs only within their 12-hour validity window; data is scoped by user and family. |
| Calendar ranges | `['family', familyId, 'calendar', range]` | 10 minutes target | Existing calendar offline store, future query-cache wrapping recommended | Current snapshot already bounded; next step is splitting by visible range and reusing overlap. |
| Tasks/chores | `['family', familyId, 'tasks', filters]` | 10 minutes target | Query cache recommended | Mutations should update affected task and invalidate only matching filter/range keys. |
| Shopping list | `['family', familyId, 'shopping-list']` | 1 minute target | Existing shopping IndexedDB repository | Keep realtime and sync queue; avoid adding a parallel cache around item mutations. |
| Chat | `['family', familyId, 'chat', conversationId, page]` | 1 minute target | Do not persist old pages by default | Use pagination plus realtime patching; avoid aggressive polling. |
| Notifications | `['family', familyId, 'notifications', page]` | 1 minute target | Optional short-lived persisted unread snapshot | Paginate and invalidate unread state only. |

## Invalidation rules

- Family name, hero image, or category-settings updates invalidate only the family settings key.
- Member profile/avatar mutations should invalidate only the members key for that family; realtime rows continue to patch local state.
- Shopping mutations remain handled by the existing repository's optimistic local queue and should not invalidate unrelated family data.
- Calendar mutations should invalidate only visible/intersecting range keys; the existing offline mutation queue remains the source of truth for unsynced local records.
- Logout clears the query-cache scope for the signed-out user in addition to existing calendar/shopping identity cleanup.
- Family switching naturally changes the scope key. Cached data for one user/family is never returned for another user/family scope.

## Persistent-cache security model

- The cache key includes scope metadata (`userId::familyId::queryKey`) and each entry stores the same scope key for verification before returning cached data.
- Cache entries are schema-versioned; incompatible future versions can be invalidated by bumping `SCHEMA_VERSION`.
- The cache stores structured application data only. It does not store Supabase auth tokens, form drafts, passwords, or secrets.
- Signed avatar/hero URLs are cached only as part of stable member/settings snapshots and only with maximum ages below their 12-hour signed URL lifetime.
- `signOutCurrentAccount` clears cached query data for the user immediately during logout.
- Supabase RLS is unchanged. The cache reduces repeated downloads after an authorized read; it does not broaden authorization.

## Representative before/after request counts

These counts are from code-path auditing rather than production Supabase logs. They represent identical recently repeated flows in development with valid cache entries.

| Flow | Before | After | Reduction driver |
| --- | ---: | ---: | --- |
| Fresh application start | ~1 membership + 1 members + 1 family settings + avatar/hero signing | Same on first authorized load | Fresh loads still validate access and populate cache. |
| Repeated application start | ~1 membership + 1 members + 1 family settings + avatar/hero signing | ~1 membership; members/settings served from cache | Stable family data persists in IndexedDB. |
| Home → Calendar → Home | Members/settings could reload on provider remounts | Stable family data reused | Cache survives remounts. |
| Switching calendar week/month | Broad snapshot risk if sync is restarted | No direct change yet; documented range-key target | Existing offline calendar should be extended to visible range keys. |
| Adding one shopping item | Existing local queue + sync | Unchanged | Avoided disrupting mature offline shopping behavior. |
| Adding/editing one calendar record | Existing mutation queue/RPC then sync | Unchanged; target range invalidation documented | Avoided broad invalidation. |
| Opening member profiles repeatedly | Full members query plus signed URL generation on remount | Cache hit for members/profile/avatar URL metadata | Reduces duplicate member downloads and signing calls. |
| Opening and leaving chat | Existing messages data source | No direct change yet | Future work: paginated cache key per conversation/page. |

## Expected egress reduction

The immediate implementation targets highly repeated stable data. For active families that navigate repeatedly or reopen the PWA several times per day, member/settings/avatar-signing metadata downloads should drop by roughly 70–90% while the 45-minute cache is valid. Overall Supabase egress reduction depends on calendar/chat volume; expected short-term reduction is modest-to-material (~10–25%) and should increase after range-based calendar caching and chat pagination are folded into the same query-cache API.

## Development diagnostics

In development, query-cache events are logged with the prefix `[Rodinka query-cache]` and include:

- `queryName`
- `table`
- estimated `bytes`
- `durationMs` for network misses
- cache event (`hit`, `miss`, `stale-fallback`, `invalidate`)
- `reason`

This provides the required diagnostics without logging private record contents.

## Remaining risks and future recommendations

1. Wrap calendar snapshot loading with explicit visible range keys and merge overlapping cached ranges.
2. Split large calendar snapshot sources so recurring source records are cached separately from visible occurrences.
3. Add chat pagination and one shared realtime subscription per active conversation/family.
4. Cache `meal_ingredients` through the centralized cache or move it into the shopping repository if it is required offline.
5. Add browser image markup improvements (`loading="lazy"`, `srcset`, thumbnail paths) where profile and hero images render.
6. Add optional development diagnostics UI that summarizes cache hit ratio and active realtime subscriptions; the structured logs are now in place.
7. Review database indexes for `family_id`, due/date-range fields, status, and chat pagination cursors against production query plans.

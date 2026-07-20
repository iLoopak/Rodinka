import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedQuery,
  clearQueryCacheScope,
  createMemoryQueryCachePersistence,
  familyQueryKey,
  invalidateQueryCache,
  setQueryCachePersistenceForTests,
} from './queryCache'

// A stand-in for IndexedDB so the persistent path is exercised for real.
// The point of every test here is what survives a remount, which is exactly
// what the in-memory Map alone can never tell us.
let persistence: ReturnType<typeof createMemoryQueryCachePersistence>

beforeEach(() => {
  persistence = createMemoryQueryCachePersistence()
  setQueryCachePersistenceForTests(persistence)
})

afterEach(() => setQueryCachePersistenceForTests(null))

/** Drops the in-memory tier only, as a page reload or provider remount would. */
function simulateRemount() {
  const kept = new Map(persistence.entries)
  setQueryCachePersistenceForTests(persistence)
  persistence.entries.clear()
  for (const [key, entry] of kept) persistence.entries.set(key, entry)
}

function options(entity: string, fetcher: () => Promise<unknown>, scope = { userId: 'user-a', familyId: 'family-a' }) {
  return {
    key: familyQueryKey(entity, scope.familyId),
    scope,
    staleTimeMs: 60_000,
    persist: true,
    queryName: `${entity}.list`,
    table: entity,
    fetcher,
  }
}

describe('query cache persistence', () => {
  it('invalidation removes the persistent entry, not just the memory one', async () => {
    let calls = 0
    const query = options('members', async () => { calls += 1; return [calls] })

    await cachedQuery(query)
    expect(calls).toBe(1)
    expect(persistence.entries.size).toBe(1)

    await invalidateQueryCache(familyQueryKey('members', 'family-a'), query.scope)
    simulateRemount()

    // Before the fix this returned the pre-invalidation value out of
    // IndexedDB and reported it as a fresh cache hit.
    const next = await cachedQuery(query)
    expect(next.cacheHit).toBe(false)
    expect(calls).toBe(2)
  })

  it('serves the persistent entry after a remount when it was not invalidated', async () => {
    let calls = 0
    const query = options('members', async () => { calls += 1; return [calls] })

    await cachedQuery(query)
    simulateRemount()

    const next = await cachedQuery(query)
    expect(next.cacheHit).toBe(true)
    expect(calls).toBe(1)
  })

  it('does not let a longer entity name collide with a shorter one', async () => {
    let members = 0
    let archive = 0
    const scope = { userId: 'user-a', familyId: 'family-a' }
    const membersQuery = options('members', async () => { members += 1; return [members] }, scope)
    const archiveQuery = options('members-archive', async () => { archive += 1; return [archive] }, scope)

    await cachedQuery(membersQuery)
    await cachedQuery(archiveQuery)

    await invalidateQueryCache(familyQueryKey('members', 'family-a'), scope)
    simulateRemount()

    expect((await cachedQuery(membersQuery)).cacheHit).toBe(false)
    // `["family","family-a","members` is a string prefix of the archive key.
    // Structural key matching is what keeps this a hit.
    expect((await cachedQuery(archiveQuery)).cacheHit).toBe(true)
    expect(archive).toBe(1)
  })

  it('does not let a shorter entity name sweep a longer one', async () => {
    const scope = { userId: 'user-a', familyId: 'family-a' }
    const membersQuery = options('members', async () => ['members'], scope)

    await cachedQuery(membersQuery)
    await invalidateQueryCache(familyQueryKey('member', 'family-a'), scope)
    simulateRemount()

    expect((await cachedQuery(membersQuery)).cacheHit).toBe(true)
  })

  it('does not write an in-flight result back after an invalidation', async () => {
    const scope = { userId: 'user-a', familyId: 'family-a' }
    let release!: (value: string[]) => void
    let calls = 0
    const query = {
      ...options('settings', () => {
        calls += 1
        return new Promise<string[]>((resolve) => { release = resolve })
      }, scope),
    }

    const pending = cachedQuery(query)
    // Let the fetch actually start; invalidating before it does is a
    // different (and already correct) case.
    await vi.waitFor(() => expect(calls).toBe(1))
    await invalidateQueryCache(familyQueryKey('settings', 'family-a'), scope)
    release(['stale'])
    const first = await pending

    // The caller still gets its answer...
    expect(first.data).toEqual(['stale'])
    // ...but it was not recorded, so the next read goes back to the source.
    simulateRemount()
    expect(persistence.entries.size).toBe(0)
    const second = await cachedQuery({ ...query, fetcher: async () => { calls += 1; return ['fresh'] } })
    expect(second.data).toEqual(['fresh'])
    expect(calls).toBe(2)
  })

  it('clears every family of a user on logout, including the persistent tier', async () => {
    const first = options('members', async () => ['a'], { userId: 'user-a', familyId: 'family-1' })
    const second = options('members', async () => ['b'], { userId: 'user-a', familyId: 'family-2' })
    const other = options('members', async () => ['c'], { userId: 'user-b', familyId: 'family-1' })
    await cachedQuery(first)
    await cachedQuery(second)
    await cachedQuery(other)

    await clearQueryCacheScope({ userId: 'user-a' })
    simulateRemount()

    expect((await cachedQuery(first)).cacheHit).toBe(false)
    expect((await cachedQuery(second)).cacheHit).toBe(false)
    // Another account's cache is untouched.
    expect((await cachedQuery(other)).cacheHit).toBe(true)
  })

  it('treats a corrupt persistent entry as a miss and refetches', async () => {
    let calls = 0
    const query = options('members', async () => { calls += 1; return [calls] })
    await cachedQuery(query)

    const [key] = [...persistence.entries.keys()]
    // Whatever "unreadable" looks like — truncated write, foreign writer,
    // hand-edited store — the app must fall through to the network.
    persistence.entries.set(key, { notAnEntry: true } as never)
    simulateRemount()

    const next = await cachedQuery(query)
    expect(next.cacheHit).toBe(false)
    expect(calls).toBe(2)
  })

  it('falls through to the network when the persistence layer throws', async () => {
    setQueryCachePersistenceForTests({
      async get() { throw new Error('QuotaExceededError') },
      async set() { throw new Error('QuotaExceededError') },
      async deleteByPrefix() { throw new Error('QuotaExceededError') },
    })
    let calls = 0
    // A dead or full store must degrade to "no cache", never to a failed read.
    const result = await cachedQuery(options('members', async () => { calls += 1; return [calls] }))
    expect(result.data).toEqual([1])
    expect(calls).toBe(1)

    // Invalidation and logout cleanup must survive it too.
    await expect(invalidateQueryCache(familyQueryKey('members', 'family-a'), { userId: 'user-a', familyId: 'family-a' })).resolves.toBeUndefined()
    await expect(clearQueryCacheScope({ userId: 'user-a' })).resolves.toBeUndefined()
  })
})

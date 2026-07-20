import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cachedQuery,
  createMemoryQueryCachePersistence,
  familyQueryKey,
  setQueryCachePersistenceForTests,
} from './queryCache'

/**
 * "A permission or auth error must never unlock cached family data" is an
 * acceptance criterion. `useFamily` honours it for the identity cache, but the
 * query cache's stale fallback did not: it returned the cached value for *any*
 * failed refresh, including an RLS rejection. A parent removed from a family
 * kept seeing its roster — names, birth dates, avatar URLs — for as long as
 * maxAge allowed, which for members is eleven hours.
 */

let persistence: ReturnType<typeof createMemoryQueryCachePersistence>

beforeEach(() => {
  persistence = createMemoryQueryCachePersistence()
  setQueryCachePersistenceForTests(persistence)
})

afterEach(() => setQueryCachePersistenceForTests(null))

const scope = { userId: 'user-a', familyId: 'family-a' }

function options(fetcher: () => Promise<unknown>) {
  return {
    key: familyQueryKey('members', 'family-a'),
    scope,
    // Already stale, so every call past the first attempts a refresh and can
    // reach the fallback.
    staleTimeMs: -1,
    maxAgeMs: 11 * 60 * 60 * 1000,
    persist: true,
    queryName: 'members.list',
    table: 'members',
    fetcher,
  }
}

const roster = [{ id: 'member-1', display_name: 'Ema', birth_date: '2015-03-02' }]

async function seed() {
  await cachedQuery(options(async () => roster))
}

describe('query cache and permission errors', () => {
  it('does not serve cached family data after an RLS rejection', async () => {
    await seed()

    const rls = { code: '42501', message: 'new row violates row-level security policy' }
    await expect(cachedQuery(options(async () => { throw rls }))).rejects.toBe(rls)
  })

  it('drops the cached copy once access is denied', async () => {
    await seed()
    expect(persistence.entries.size).toBe(1)

    await cachedQuery(options(async () => { throw { code: '42501', message: 'permission denied' } })).catch(() => undefined)

    // Withholding is not enough. Someone removed from a family should not
    // still have its roster sitting in IndexedDB on their device.
    expect(persistence.entries.size).toBe(0)
  })

  it('does not serve cached data on a 403 either', async () => {
    await seed()
    const forbidden = new Error('403 Forbidden')
    await expect(cachedQuery(options(async () => { throw forbidden }))).rejects.toThrow('403')
  })

  it('withholds cached data when the session has expired', async () => {
    await seed()
    const expired = new Error('JWT expired')
    await expect(cachedQuery(options(async () => { throw expired }))).rejects.toThrow('JWT')
  })

  it('keeps the cached copy through an expired session, which a refresh will fix', async () => {
    await seed()
    await cachedQuery(options(async () => { throw new Error('JWT expired') })).catch(() => undefined)

    // Unlike losing access, an expired token does not mean the data stopped
    // being theirs — re-authenticating should not force a cold refetch.
    expect(persistence.entries.size).toBe(1)
  })

  it('still serves cached data through a genuine outage', async () => {
    await seed()

    // The offline capability has to survive the fix above: this is the whole
    // reason the stale fallback exists.
    const result = await cachedQuery(options(async () => { throw new TypeError('Failed to fetch') }))
    expect(result.stale).toBe(true)
    expect(result.data).toEqual(roster)
    expect(persistence.entries.size).toBe(1)
  })

  it('still serves cached data when the backend times out', async () => {
    await seed()
    const result = await cachedQuery(options(async () => { throw new Error('request timed out') }))
    expect(result.stale).toBe(true)
    expect(result.data).toEqual(roster)
  })
})

import { describe, expect, it } from 'vitest'
import { cachedQuery, clearQueryCacheScope, familyQueryKey, invalidateQueryCache } from './queryCache'

describe('queryCache', () => {
  it('deduplicates repeated scoped reads while data is fresh', async () => {
    let calls = 0
    const options = {
      key: familyQueryKey('members', 'family-a'),
      scope: { userId: 'user-a', familyId: 'family-a' },
      staleTimeMs: 60_000,
      queryName: 'members.list',
      table: 'members',
      fetcher: async () => { calls += 1; return [{ id: 'member-a' }] },
    }
    const first = await cachedQuery(options)
    const second = await cachedQuery(options)
    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(calls).toBe(1)
  })

  it('scopes cached data by user and family', async () => {
    let calls = 0
    const fetcher = async () => { calls += 1; return [{ id: `value-${calls}` }] }
    await cachedQuery({ key: familyQueryKey('tasks', 'family-a'), scope: { userId: 'user-a', familyId: 'family-a' }, staleTimeMs: 60_000, queryName: 'tasks.list', table: 'tasks', fetcher })
    const otherUser = await cachedQuery({ key: familyQueryKey('tasks', 'family-a'), scope: { userId: 'user-b', familyId: 'family-a' }, staleTimeMs: 60_000, queryName: 'tasks.list', table: 'tasks', fetcher })
    const otherFamily = await cachedQuery({ key: familyQueryKey('tasks', 'family-b'), scope: { userId: 'user-a', familyId: 'family-b' }, staleTimeMs: 60_000, queryName: 'tasks.list', table: 'tasks', fetcher })
    expect(otherUser.cacheHit).toBe(false)
    expect(otherFamily.cacheHit).toBe(false)
    expect(calls).toBe(3)
  })

  it('clears a user scope on logout or account switch', async () => {
    let calls = 0
    const options = { key: familyQueryKey('shopping-list', 'family-a'), scope: { userId: 'user-logout', familyId: 'family-a' }, staleTimeMs: 60_000, queryName: 'shopping.list', table: 'shopping_items', fetcher: async () => { calls += 1; return [{ id: calls }] } }
    await cachedQuery(options)
    await clearQueryCacheScope({ userId: 'user-logout' })
    const next = await cachedQuery(options)
    expect(next.cacheHit).toBe(false)
    expect(calls).toBe(2)
  })

  it('invalidates only matching entity keys', async () => {
    let memberCalls = 0
    let taskCalls = 0
    const scope = { userId: 'user-invalidate', familyId: 'family-a' }
    const members = { key: familyQueryKey('members', 'family-a'), scope, staleTimeMs: 60_000, queryName: 'members.list', table: 'members', fetcher: async () => { memberCalls += 1; return [memberCalls] } }
    const tasks = { key: familyQueryKey('tasks', 'family-a'), scope, staleTimeMs: 60_000, queryName: 'tasks.list', table: 'tasks', fetcher: async () => { taskCalls += 1; return [taskCalls] } }
    await cachedQuery(members); await cachedQuery(tasks)
    await invalidateQueryCache(familyQueryKey('members', 'family-a'), scope)
    const nextMembers = await cachedQuery(members)
    const nextTasks = await cachedQuery(tasks)
    expect(nextMembers.cacheHit).toBe(false)
    expect(nextTasks.cacheHit).toBe(true)
  })

  it('returns stale cached data when offline refresh fails within max age', async () => {
    const options = { key: familyQueryKey('calendar', 'family-a', { start: '2026-07-01', end: '2026-07-31' }), scope: { userId: 'user-offline', familyId: 'family-a' }, staleTimeMs: -1, maxAgeMs: 60_000, queryName: 'calendar.range', table: 'calendar', fetcher: async () => [{ id: 'snapshot' }] }
    await cachedQuery(options)
    const offline = await cachedQuery({ ...options, fetcher: async () => { throw new Error('offline') } })
    expect(offline.cacheHit).toBe(true)
    expect(offline.stale).toBe(true)
    expect(offline.data).toEqual([{ id: 'snapshot' }])
  })
})

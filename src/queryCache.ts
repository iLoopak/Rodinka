export type QueryCacheReason = 'mount' | 'manual' | 'mutation' | 'realtime' | 'bootstrap'

export interface QueryCacheOptions<T> {
  key: readonly unknown[]
  scope: { userId: string | null; familyId: string | null }
  staleTimeMs: number
  maxAgeMs?: number
  persist?: boolean
  queryName: string
  table: string
  reason?: QueryCacheReason
  fetcher: () => Promise<T>
}

interface Entry<T = unknown> { value: T; updatedAt: number; scopeKey: string; schemaVersion: number }

const SCHEMA_VERSION = 1
const DB_NAME = 'rodinka-query-cache'
const STORE = 'queries'
const memory = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
let dbPromise: Promise<IDBDatabase | null> | null = null

const devEnabled = () => typeof import.meta !== 'undefined' && import.meta.env?.DEV
const now = () => Date.now()

export function familyQueryKey(entity: string, familyId: string | null | undefined, ...parts: unknown[]) {
  return ['family', familyId ?? 'none', entity, ...parts] as const
}

export const cacheTimes = {
  stable: 45 * 60 * 1000,
  moderate: 10 * 60 * 1000,
  frequent: 60 * 1000,
  gc: 24 * 60 * 60 * 1000,
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function scopeKey(scope: QueryCacheOptions<unknown>['scope']) { return `${scope.userId ?? 'anonymous'}::${scope.familyId ?? 'none'}` }
function cacheKey(key: readonly unknown[], scope: QueryCacheOptions<unknown>['scope']) { return `${scopeKey(scope)}::${stableStringify(key)}` }

function approxBytes(value: unknown): number | null {
  try { return new Blob([JSON.stringify(value)]).size } catch { return null }
}

function log(event: string, details: Record<string, unknown>) {
  if (!devEnabled()) return
  console.info(`[Rodinka query-cache] ${event}`, details)
}

async function db() {
  if (typeof indexedDB === 'undefined') return null
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
  return dbPromise
}

async function idbGet<T>(key: string): Promise<Entry<T> | null> {
  const database = await db(); if (!database) return null
  return new Promise((resolve) => {
    const tx = database.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(key)
    request.onsuccess = () => resolve((request.result as Entry<T> | undefined) ?? null)
    request.onerror = () => resolve(null)
  })
}

async function idbSet(key: string, entry: Entry) {
  const database = await db(); if (!database) return
  await new Promise<void>((resolve) => {
    const tx = database.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(entry, key)
    tx.oncomplete = () => resolve(); tx.onerror = () => resolve()
  })
}

export async function clearQueryCacheScope(scope: { userId: string | null; familyId?: string | null }) {
  const prefix = `${scope.userId ?? 'anonymous'}::${scope.familyId ?? ''}`
  for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key)
  const database = await db(); if (!database) return
  await new Promise<void>((resolve) => {
    const tx = database.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const request = store.openCursor()
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (String(cursor.key).startsWith(prefix)) cursor.delete(); cursor.continue() }
    tx.oncomplete = () => resolve(); tx.onerror = () => resolve()
  })
}

export async function invalidateQueryCache(prefixKey: readonly unknown[], scope: { userId: string | null; familyId: string | null }) {
  const prefix = `${scopeKey(scope)}::${stableStringify(prefixKey).slice(0, -1)}`
  for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key)
  log('invalidate', { key: prefixKey, scope: scopeKey(scope) })
}

export async function cachedQuery<T>(options: QueryCacheOptions<T>): Promise<{ data: T; cacheHit: boolean; stale: boolean }> {
  const key = cacheKey(options.key, options.scope)
  const maxAge = options.maxAgeMs ?? cacheTimes.gc
  const existing = memory.get(key) as Entry<T> | undefined ?? (options.persist ? await idbGet<T>(key) : null)
  if (existing?.schemaVersion === SCHEMA_VERSION && existing.scopeKey === scopeKey(options.scope) && now() - existing.updatedAt <= options.staleTimeMs) {
    memory.set(key, existing)
    log('hit', { queryName: options.queryName, table: options.table, reason: options.reason ?? 'mount', bytes: approxBytes(existing.value) })
    return { data: existing.value, cacheHit: true, stale: false }
  }
  if (existing && now() - existing.updatedAt <= maxAge) memory.set(key, existing)
  const startedAt = performance.now()
  let promise = inflight.get(key) as Promise<T> | undefined
  if (!promise) {
    promise = options.fetcher()
    inflight.set(key, promise)
  }
  try {
    const value = await promise
    const entry: Entry<T> = { value, updatedAt: now(), scopeKey: scopeKey(options.scope), schemaVersion: SCHEMA_VERSION }
    memory.set(key, entry); if (options.persist) void idbSet(key, entry)
    log('miss', { queryName: options.queryName, table: options.table, reason: options.reason ?? 'mount', durationMs: Math.round(performance.now() - startedAt), bytes: approxBytes(value) })
    return { data: value, cacheHit: false, stale: false }
  } catch (error) {
    if (existing && now() - existing.updatedAt <= maxAge) {
      log('stale-fallback', { queryName: options.queryName, table: options.table, reason: options.reason ?? 'mount' })
      return { data: existing.value, cacheHit: true, stale: true }
    }
    throw error
  } finally { inflight.delete(key) }
}

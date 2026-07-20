import { classifyAppError, classifyStorageError, deniesCachedData } from './errors/errorCodes'

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

interface Entry<T = unknown> {
  value: T
  updatedAt: number
  scopeKey: string
  schemaVersion: number
}

/**
 * Persistence is behind an interface so tests can exercise the real
 * invalidation path without IndexedDB. `deleteByPrefix` is part of the
 * contract rather than something the caller emulates with a scan, because
 * getting the prefix boundary right is the whole point of P0-2.
 */
export interface QueryCachePersistence {
  get(key: string): Promise<Entry | null>
  set(key: string, entry: Entry): Promise<void>
  deleteByPrefix(prefix: string): Promise<void>
}

const SCHEMA_VERSION = 1
const DB_NAME = 'rodinka-query-cache'
const STORE = 'queries'

const memory = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
/**
 * Per-key invalidation counter. A fetch records the counter it started with;
 * if invalidation bumped it before the fetch resolved, the answer is handed
 * to the caller but never stored — otherwise an invalidation issued mid-flight
 * would be silently undone by the response it was meant to supersede (P1-1).
 */
const epochs = new Map<string, number>()

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

/** How long before a signed URL expires we stop serving it from cache. */
export const SIGNED_URL_CACHE_MARGIN_MS = 60 * 60 * 1000

/**
 * The max age for a cached payload that embeds a signed URL, derived from the
 * URL's own lifetime rather than written out as a second magic number.
 *
 * A cached entry that outlives its signed URLs hands the UI links that 403 —
 * broken avatars and a missing family header. The two values were previously
 * independent constants (12h TTL, 11h max age) that happened to be ordered
 * correctly; editing either one alone would have broken images silently.
 */
export function signedUrlMaxAgeMs(signedUrlSeconds: number) {
  return Math.max(0, signedUrlSeconds * 1000 - SIGNED_URL_CACHE_MARGIN_MS)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const SEPARATOR = '\u0000'

/**
 * Every segment is terminated by NUL rather than joined by one. That makes a
 * string prefix an exact structural prefix: `"members"\0` cannot be a prefix
 * of `"members-archive"\0`, which is precisely the collision the old
 * `stableStringify(key).slice(0, -1)` prefix allowed in both directions.
 *
 * JSON.stringify escapes U+0000 as the six characters `\u0000`, so a raw NUL
 * can never appear inside a segment and the boundary is unambiguous.
 */
function encodeSegments(...segments: string[]) {
  return segments.map((segment) => `${segment}${SEPARATOR}`).join('')
}

function scopeKey(scope: QueryCacheOptions<unknown>['scope']) {
  return encodeSegments(scope.userId ?? 'anonymous', scope.familyId ?? 'none')
}

function cacheKey(key: readonly unknown[], scope: QueryCacheOptions<unknown>['scope']) {
  return scopeKey(scope) + encodeSegments(...key.map(stableStringify))
}

function keyPrefix(prefixKey: readonly unknown[], scope: QueryCacheOptions<unknown>['scope']) {
  return scopeKey(scope) + encodeSegments(...prefixKey.map(stableStringify))
}

function approxBytes(value: unknown): number | null {
  try { return new Blob([JSON.stringify(value)]).size } catch { return null }
}

function log(event: string, details: Record<string, unknown>) {
  if (!devEnabled()) return
  console.info(`[Rodinka query-cache] ${event}`, details)
}

function epochOf(key: string) { return epochs.get(key) ?? 0 }

/** A record that survived storage but cannot be trusted is treated as a miss. */
function isUsableEntry(entry: unknown): entry is Entry {
  if (!entry || typeof entry !== 'object') return false
  const candidate = entry as Partial<Entry>
  return typeof candidate.updatedAt === 'number'
    && Number.isFinite(candidate.updatedAt)
    && typeof candidate.scopeKey === 'string'
    && candidate.schemaVersion === SCHEMA_VERSION
    && 'value' in candidate
}

class IndexedDbQueryCachePersistence implements QueryCachePersistence {
  private databasePromise: Promise<IDBDatabase | null> | null = null

  private database() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)
    this.databasePromise ??= new Promise<IDBDatabase | null>((resolve) => {
      let request: IDBOpenDBRequest
      try { request = indexedDB.open(DB_NAME, SCHEMA_VERSION) }
      catch { resolve(null); return }
      // Guard the create: a schema bump would otherwise throw
      // ConstraintError here, the open would fail, and persistence would
      // stay silently dead for the rest of the session (P1-6).
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE)
      }
      request.onsuccess = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE)) { resolve(null); return }
        resolve(database)
      }
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
    return this.databasePromise
  }

  async get(key: string) {
    const database = await this.database()
    if (!database) return null
    return new Promise<Entry | null>((resolve) => {
      try {
        const transaction = database.transaction(STORE, 'readonly')
        const request = transaction.objectStore(STORE).get(key)
        request.onsuccess = () => resolve((request.result as Entry | undefined) ?? null)
        request.onerror = () => resolve(null)
      } catch { resolve(null) }
    })
  }

  async set(key: string, entry: Entry) {
    const database = await this.database()
    if (!database) return
    await new Promise<void>((resolve) => {
      try {
        const transaction = database.transaction(STORE, 'readwrite')
        transaction.objectStore(STORE).put(entry, key)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => { log('storage-error', { code: classifyStorageError(transaction.error) }); resolve() }
        transaction.onabort = () => { log('storage-error', { code: classifyStorageError(transaction.error) }); resolve() }
      } catch { resolve() }
    })
  }

  async deleteByPrefix(prefix: string) {
    const database = await this.database()
    if (!database) return
    await new Promise<void>((resolve) => {
      try {
        const transaction = database.transaction(STORE, 'readwrite')
        const request = transaction.objectStore(STORE).openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          if (String(cursor.key).startsWith(prefix)) cursor.delete()
          cursor.continue()
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
        transaction.onabort = () => resolve()
      } catch { resolve() }
    })
  }
}

let persistence: QueryCachePersistence = new IndexedDbQueryCachePersistence()

/** Test seam. Production wiring never calls this. */
export function setQueryCachePersistenceForTests(next: QueryCachePersistence | null) {
  persistence = next ?? new IndexedDbQueryCachePersistence()
  memory.clear()
  inflight.clear()
  epochs.clear()
}

export function createMemoryQueryCachePersistence(): QueryCachePersistence & { entries: Map<string, Entry> } {
  const entries = new Map<string, Entry>()
  return {
    entries,
    async get(key) { return entries.get(key) ?? null },
    async set(key, entry) { entries.set(key, entry) },
    async deleteByPrefix(prefix) {
      for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key)
    },
  }
}

function deleteMemoryByPrefix(prefix: string) {
  let removed = 0
  for (const key of [...memory.keys()]) {
    if (!key.startsWith(prefix)) continue
    memory.delete(key)
    epochs.set(key, epochOf(key) + 1)
    removed += 1
  }
  return removed
}

/**
 * Clears every cached read for a user. Passing no familyId clears all of the
 * user's families; the terminated-segment encoding means `userId\0` cannot
 * partially match a different user id.
 */
export async function clearQueryCacheScope(scope: { userId: string | null; familyId?: string | null }) {
  const prefix = scope.familyId === undefined
    ? encodeSegments(scope.userId ?? 'anonymous')
    : encodeSegments(scope.userId ?? 'anonymous', scope.familyId ?? 'none')
  const removed = deleteMemoryByPrefix(prefix)
  // Bump every in-flight key too: a response in the air for a signed-out
  // account must not be written back into a freshly cleared cache.
  for (const key of inflight.keys()) if (key.startsWith(prefix)) epochs.set(key, epochOf(key) + 1)
  log('scope-cleared', { removed })
  await persistence.deleteByPrefix(prefix).catch((error: unknown) => {
    log('storage-error', { code: classifyStorageError(error) })
  })
}

export async function invalidateQueryCache(prefixKey: readonly unknown[], scope: { userId: string | null; familyId: string | null }) {
  const prefix = keyPrefix(prefixKey, scope)
  const removed = deleteMemoryByPrefix(prefix)
  for (const key of inflight.keys()) if (key.startsWith(prefix)) epochs.set(key, epochOf(key) + 1)
  log('invalidate', { key: prefixKey, removed })
  // The persistent copy has to go too, or a remount reads the pre-invalidation
  // value straight back out of IndexedDB and calls it fresh (P0-1).
  await persistence.deleteByPrefix(prefix).catch((error: unknown) => {
    log('storage-error', { code: classifyStorageError(error) })
  })
}

export async function cachedQuery<T>(options: QueryCacheOptions<T>): Promise<{ data: T; cacheHit: boolean; stale: boolean }> {
  const key = cacheKey(options.key, options.scope)
  const maxAge = options.maxAgeMs ?? cacheTimes.gc
  const scope = scopeKey(options.scope)

  const cached = memory.get(key) as Entry<T> | undefined
  let existing: Entry<T> | null = cached ?? null
  if (!existing && options.persist) {
    // A broken store degrades to "no cache", never to a failed read. The
    // network path stays available whatever IndexedDB is doing.
    const stored = await persistence.get(key).catch((error: unknown) => {
      log('storage-error', { code: classifyStorageError(error), queryName: options.queryName })
      return null
    })
    if (stored && !isUsableEntry(stored)) {
      log('cache-corrupt', { queryName: options.queryName })
      void persistence.deleteByPrefix(key).catch(() => undefined)
    } else {
      existing = (stored as Entry<T> | null) ?? null
    }
  }
  if (existing && existing.scopeKey !== scope) existing = null

  if (existing && now() - existing.updatedAt <= options.staleTimeMs) {
    memory.set(key, existing)
    log('hit', { queryName: options.queryName, table: options.table, reason: options.reason ?? 'mount', bytes: approxBytes(existing.value) })
    return { data: existing.value, cacheHit: true, stale: false }
  }
  if (existing && now() - existing.updatedAt <= maxAge) memory.set(key, existing)

  const startedAt = performance.now()
  const startEpoch = epochOf(key)
  let promise = inflight.get(key) as Promise<T> | undefined
  if (!promise) {
    promise = options.fetcher()
    inflight.set(key, promise)
  }

  try {
    const value = await promise
    if (epochOf(key) !== startEpoch) {
      // Invalidated while this was in flight. The caller still gets the
      // answer it asked for, but it is not recorded as the current value.
      log('invalidated-in-flight', { queryName: options.queryName })
      return { data: value, cacheHit: false, stale: false }
    }
    const entry: Entry<T> = { value, updatedAt: now(), scopeKey: scope, schemaVersion: SCHEMA_VERSION }
    memory.set(key, entry)
    if (options.persist) {
      void persistence.set(key, entry).catch((error: unknown) => {
        log('storage-error', { code: classifyStorageError(error), queryName: options.queryName })
      })
    }
    log('miss', { queryName: options.queryName, table: options.table, reason: options.reason ?? 'mount', durationMs: Math.round(performance.now() - startedAt), bytes: approxBytes(value) })
    return { data: value, cacheHit: false, stale: false }
  } catch (error) {
    // The stale fallback exists for outages. An authorization failure is not
    // an outage: serving the cached value there would keep showing family
    // data to someone the server just refused, for as long as maxAge allows.
    const code = classifyAppError(error)
    if (deniesCachedData(code)) {
      memory.delete(key)
      // Losing access is not the same as a stale token. If the server says
      // this is no longer theirs, the local copy goes too; an expired session
      // only withholds, because re-authenticating makes it theirs again.
      if (code !== 'auth-expired') {
        epochs.set(key, epochOf(key) + 1)
        if (options.persist) {
          void persistence.deleteByPrefix(key).catch((storageError: unknown) => {
            log('storage-error', { code: classifyStorageError(storageError), queryName: options.queryName })
          })
        }
      }
      log('denied', { queryName: options.queryName, table: options.table, code })
      throw error
    }
    if (existing && now() - existing.updatedAt <= maxAge && epochOf(key) === startEpoch) {
      log('stale-fallback', { queryName: options.queryName, table: options.table, reason: options.reason ?? 'mount' })
      return { data: existing.value, cacheHit: true, stale: true }
    }
    throw error
  } finally {
    if (inflight.get(key) === promise) inflight.delete(key)
  }
}

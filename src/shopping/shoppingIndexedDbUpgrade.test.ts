import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IndexedDbShoppingStore } from './shoppingIndexedDb'
import { newShoppingMutationState } from './shoppingMutationQueue'
import type { ShoppingItem } from '../utils/shopping'

const DB_NAME = 'rodinka-offline'
const FAMILY = 'family-1'
const USER_A = { userId: 'user-a', familyId: FAMILY }
const USER_B = { userId: 'user-b', familyId: FAMILY }

/**
 * The v3 → v4 upgrade is the one fix in this batch that runs against real
 * user data on a real device: it drops shopping rows that predate user
 * scoping. Everything else about P0-4 can be checked against the in-memory
 * store, but "does the migration destroy the wrong thing" cannot.
 */

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function legacyItem(id: string): ShoppingItem {
  return {
    id, family_id: FAMILY, name: 'Mléko', normalized_name: 'mleko', quantity: 1, unit: 'l',
    note: null, category: 'dairy', created_by_member_id: 'member-a', responsible_member_id: null,
    purchased: false, purchased_by_member_id: null, purchased_at: null, archived_at: null,
    sort_order: 1024, source_meal_id: null, source_meal_plan_entry_id: null,
    created_at: '2026-07-19T09:00:00.000Z', updated_at: '2026-07-19T09:00:00.000Z',
  } as ShoppingItem
}

/** Recreates the exact v3 schema, then fills it the way a real client would. */
async function seedVersion3() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 3)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => resolve(open.result)
    open.onupgradeneeded = () => {
      const database = open.result
      for (const name of ['shoppingItems', 'shoppingMutations']) {
        const store = database.createObjectStore(name, { keyPath: name === 'shoppingItems' ? 'key' : 'mutationId' })
        store.createIndex('familyId', 'familyId', { unique: false })
      }
      database.createObjectStore('shoppingMetadata', { keyPath: 'familyId' })
      database.createObjectStore('shoppingTemplates', { keyPath: 'familyId' })
      database.createObjectStore('shoppingCategorySettings', { keyPath: 'familyId' })
      database.createObjectStore('shoppingFamilyIdentity', { keyPath: 'userId' })
      for (const name of ['calendarSnapshots', 'calendarMutations']) {
        const store = database.createObjectStore(name, { keyPath: name === 'calendarSnapshots' ? 'scopeKey' : 'operationId' })
        store.createIndex('scopeKey', 'scopeKey', { unique: false })
        store.createIndex('familyId', 'familyId', { unique: false })
        store.createIndex('userId', 'userId', { unique: false })
      }
    }
  })

  const transaction = db.transaction(
    ['shoppingItems', 'shoppingMutations', 'shoppingMetadata', 'shoppingTemplates', 'shoppingCategorySettings', 'shoppingFamilyIdentity', 'calendarSnapshots'],
    'readwrite',
  )
  transaction.objectStore('shoppingItems').put({ key: `${FAMILY}:item-legacy`, familyId: FAMILY, item: legacyItem('item-legacy') })
  transaction.objectStore('shoppingMutations').put({
    mutationId: 'mutation-legacy', familyId: FAMILY, type: 'create', itemId: 'item-legacy',
    payload: { item: legacyItem('item-legacy') }, createdAt: '2026-07-19T09:00:00.000Z',
  })
  transaction.objectStore('shoppingMetadata').put({ familyId: FAMILY, hasSnapshot: true, lastSuccessfulSyncAt: '2026-07-19T09:00:00.000Z' })
  transaction.objectStore('shoppingTemplates').put({ familyId: FAMILY, templates: [{ name: 'Mléko', category: 'dairy' }] })
  transaction.objectStore('shoppingCategorySettings').put({ familyId: FAMILY, settings: { order: ['dairy'], hidden: [] } })
  transaction.objectStore('shoppingFamilyIdentity').put({ userId: 'user-a', member: { id: 'member-a', family_id: FAMILY, display_name: 'Alice' } })
  transaction.objectStore('calendarSnapshots').put({
    scopeKey: 'user-a:family-1', userId: 'user-a', familyId: FAMILY, schemaVersion: 1,
    hasSnapshot: true, data: { chores: [], rangeStart: '2026-01-01', rangeEnd: '2026-12-31' },
    lastSuccessfulSyncAt: '2026-07-19T09:00:00.000Z',
  })
  await done(transaction)
  db.close()
}

// Every connection opened by a test is tracked, because an open handle
// blocks deleteDatabase and would leak state into the next case.
const openStores: IndexedDbShoppingStore[] = []
const openConnections: IDBDatabase[] = []

function newStore() {
  const store = new IndexedDbShoppingStore()
  openStores.push(store)
  return store
}

async function openCurrent() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => resolve(open.result)
  })
  openConnections.push(database)
  return database
}

async function resetDatabase() {
  for (const store of openStores.splice(0)) await store.close()
  for (const connection of openConnections.splice(0)) connection.close()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    // A blocked delete means a handle leaked; failing loudly beats a
    // mysterious timeout in whichever case runs next.
    request.onblocked = () => reject(new Error('deleteDatabase blocked by an open connection'))
  })
}

beforeEach(resetDatabase)
afterEach(resetDatabase)

describe('shopping IndexedDB v3 → v4 upgrade', () => {
  it('drops legacy shopping rows that cannot be attributed to an account', async () => {
    await seedVersion3()
    const store = newStore()

    // Legacy rows have no userId. Carrying them forward under any scope is
    // precisely the leak — and replaying that queue would post one user's
    // items under another's identity.
    expect(await store.loadItems(USER_A)).toEqual([])
    expect(await store.loadMutations(USER_A)).toEqual([])
    expect(await store.loadMetadata(USER_A)).toBeNull()
    expect(await store.loadTemplates(USER_A)).toEqual([])

    const db = await openCurrent()
    const transaction = db.transaction(['shoppingItems', 'shoppingMutations'], 'readonly')
    // Gone outright, not merely unreachable through the scoped accessor.
    expect(await promisify(transaction.objectStore('shoppingItems').count())).toBe(0)
    expect(await promisify(transaction.objectStore('shoppingMutations').count())).toBe(0)
  })

  it('preserves the layers that were already user-scoped', async () => {
    await seedVersion3()
    const store = newStore()

    // The calendar snapshot carries medical records and is expensive to
    // refetch; it was already keyed by user, so the migration must not touch
    // it. Same for the identity cache that opens the shell offline.
    const snapshot = await store.loadCalendarSnapshot('user-a:family-1')
    expect(snapshot?.hasSnapshot).toBe(true)
    expect(snapshot?.lastSuccessfulSyncAt).toBe('2026-07-19T09:00:00.000Z')

    const identity = await store.loadFamilyIdentity('user-a')
    expect(identity?.display_name).toBe('Alice')

    // Family configuration, not user data — stays family-keyed by design.
    expect(await store.loadCategorySettings(FAMILY)).toEqual({ order: ['dairy'], hidden: [] })
  })

  it('rebuilds the shopping stores with a working userId index', async () => {
    await seedVersion3()
    // Touch the store first: opening the database is what runs the upgrade.
    await newStore().loadItems(USER_A)

    const db = await openCurrent()
    expect(db.version).toBe(4)
    const transaction = db.transaction(['shoppingItems', 'shoppingMutations', 'shoppingMetadata', 'shoppingTemplates'], 'readonly')
    for (const name of ['shoppingItems', 'shoppingMutations', 'shoppingMetadata', 'shoppingTemplates']) {
      const indexes = [...transaction.objectStore(name).indexNames]
      expect(indexes).toContain('userId')
      expect(indexes).toContain('scopeKey')
    }
  })

  it('isolates two accounts in the same family after the upgrade', async () => {
    await seedVersion3()
    const store = newStore()

    await store.replaceItems(USER_A, [legacyItem('item-a')])
    await store.saveMetadata(USER_A, { familyId: FAMILY, hasSnapshot: true, lastSuccessfulSyncAt: '2026-07-20T09:00:00.000Z' })

    expect(await store.loadItems(USER_B)).toEqual([])
    expect(await store.loadMetadata(USER_B)).toBeNull()
    expect(await store.loadItems(USER_A)).toHaveLength(1)
  })

  it('clears one account through the real userId index without touching the other', async () => {
    await seedVersion3()
    const store = newStore()

    await store.replaceItems(USER_A, [legacyItem('item-a')])
    await store.replaceMutations(USER_A, [{
      mutationId: 'mutation-a', familyId: FAMILY, type: 'create', itemId: 'item-a',
      payload: { item: legacyItem('item-a') }, createdAt: '2026-07-20T09:00:00.000Z', ...newShoppingMutationState(),
    }])
    await store.replaceItems(USER_B, [legacyItem('item-b')])

    await store.clearShoppingUser('user-a')

    expect(await store.loadItems(USER_A)).toEqual([])
    expect(await store.loadMutations(USER_A)).toEqual([])
    expect(await store.loadItems(USER_B)).toHaveLength(1)
  })

  it('creates a usable schema on a device with no prior database', async () => {
    // First install: onupgradeneeded runs with no legacy stores to delete.
    const store = newStore()
    await store.replaceItems(USER_A, [legacyItem('item-a')])
    expect(await store.loadItems(USER_A)).toHaveLength(1)

    const db = await openCurrent()
    expect(db.version).toBe(4)
  })
})

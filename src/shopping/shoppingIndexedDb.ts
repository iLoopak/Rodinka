import type { ShoppingMutation } from './shoppingMutationQueue'
import type { ShoppingItem, ShoppingTemplate } from '../utils/shopping'
import type { ShoppingCategorySettings } from '../utils/shoppingCategorySettings'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { CalendarMutation, CalendarSnapshotData } from '../calendar/calendarTypes'
import { CALENDAR_LOCAL_SCHEMA_VERSION } from '../calendar/calendarTypes'

export interface ShoppingSyncMetadata {
  familyId: string
  hasSnapshot: boolean
  lastSuccessfulSyncAt: string | null
}

/**
 * Shopping records carry the user they were cached for. They used to be keyed
 * by familyId alone, which meant a signed-out user's snapshot AND their unsent
 * mutation queue were picked up verbatim by the next account to sign in on the
 * device — and replayed under that account's identity (audit P0-4).
 */
export type ShoppingScope = { userId: string; familyId: string }

export function shoppingScopeKey(scope: ShoppingScope) {
  return `${scope.userId}:${scope.familyId}`
}

export interface OfflineLocalStore {
  loadItems(scope: ShoppingScope): Promise<ShoppingItem[]>
  replaceItems(scope: ShoppingScope, items: ShoppingItem[]): Promise<void>
  loadMutations(scope: ShoppingScope): Promise<ShoppingMutation[]>
  replaceMutations(scope: ShoppingScope, mutations: ShoppingMutation[]): Promise<void>
  loadMetadata(scope: ShoppingScope): Promise<ShoppingSyncMetadata | null>
  saveMetadata(scope: ShoppingScope, metadata: ShoppingSyncMetadata): Promise<void>
  saveTemplates(scope: ShoppingScope, templates: ShoppingTemplate[]): Promise<void>
  loadTemplates(scope: ShoppingScope): Promise<ShoppingTemplate[]>
  saveCategorySettings(familyId: string, settings: ShoppingCategorySettings): Promise<void>
  loadCategorySettings(familyId: string): Promise<ShoppingCategorySettings | null>
  loadFamilyIdentity(userId: string): Promise<FamilyMember | null>
  saveFamilyIdentity(userId: string, member: FamilyMember | null): Promise<void>
  loadCalendarSnapshot(scopeKey: string): Promise<StoredCalendarSnapshot | null>
  saveCalendarSnapshot(snapshot: StoredCalendarSnapshot): Promise<void>
  loadCalendarMutations(scopeKey: string): Promise<CalendarMutation[]>
  replaceCalendarMutations(scopeKey: string, mutations: CalendarMutation[]): Promise<void>
  clearCalendarUser(userId: string): Promise<void>
  clearShoppingUser(userId: string): Promise<void>
}

export type ShoppingLocalStore = OfflineLocalStore

export interface StoredCalendarSnapshot {
  scopeKey: string
  userId: string
  familyId: string
  schemaVersion: number
  hasSnapshot: boolean
  data: CalendarSnapshotData
  lastSuccessfulSyncAt: string | null
}

interface StoredItem { key: string; scopeKey: string; userId: string; familyId: string; item: ShoppingItem }
interface StoredMutation extends ShoppingMutation { scopeKey: string; userId: string }
interface StoredMetadata extends ShoppingSyncMetadata { scopeKey: string; userId: string }
interface StoredTemplates { scopeKey: string; userId: string; familyId: string; templates: ShoppingTemplate[] }
interface StoredCategorySettings { familyId: string; settings: ShoppingCategorySettings }
interface StoredFamilyIdentity { userId: string; member: FamilyMember }

const DB_NAME = 'rodinka-offline'
const DB_VERSION = 4

export class IndexedDbShoppingStore implements ShoppingLocalStore {
  private databasePromise: Promise<IDBDatabase> | null = null

  private database() {
    if (!this.databasePromise) this.databasePromise = openDatabase()
    return this.databasePromise
  }

  /**
   * Releases the connection. An open handle blocks `deleteDatabase` and any
   * future `versionchange` transaction, so anything that tears a store down
   * has to call this rather than just dropping the reference.
   */
  async close() {
    const pending = this.databasePromise
    this.databasePromise = null
    if (!pending) return
    await pending.then((database) => database.close(), () => undefined)
  }

  async loadItems(scope: ShoppingScope) {
    const rows = await getAllByIndex<StoredItem>(await this.database(), 'shoppingItems', 'scopeKey', shoppingScopeKey(scope))
    return rows.map((row) => row.item)
  }

  async replaceItems(scope: ShoppingScope, items: ShoppingItem[]) {
    const scopeKey = shoppingScopeKey(scope)
    const db = await this.database()
    const transaction = db.transaction('shoppingItems', 'readwrite')
    const store = transaction.objectStore('shoppingItems')
    const existing = await request(store.index('scopeKey').getAllKeys(IDBKeyRange.only(scopeKey)))
    for (const key of existing) store.delete(key)
    for (const item of items) {
      store.put({ key: itemKey(scopeKey, item.id), scopeKey, userId: scope.userId, familyId: scope.familyId, item } satisfies StoredItem)
    }
    await transactionDone(transaction)
  }

  async loadMutations(scope: ShoppingScope) {
    const rows = await getAllByIndex<StoredMutation>(await this.database(), 'shoppingMutations', 'scopeKey', shoppingScopeKey(scope))
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async replaceMutations(scope: ShoppingScope, mutations: ShoppingMutation[]) {
    const scopeKey = shoppingScopeKey(scope)
    const db = await this.database()
    const transaction = db.transaction('shoppingMutations', 'readwrite')
    const store = transaction.objectStore('shoppingMutations')
    const existing = await request(store.index('scopeKey').getAllKeys(IDBKeyRange.only(scopeKey)))
    for (const key of existing) store.delete(key)
    for (const mutation of mutations) store.put({ ...mutation, scopeKey, userId: scope.userId } satisfies StoredMutation)
    await transactionDone(transaction)
  }

  async loadMetadata(scope: ShoppingScope) {
    const stored = await readOne<StoredMetadata>(await this.database(), 'shoppingMetadata', shoppingScopeKey(scope))
    return stored ? { familyId: stored.familyId, hasSnapshot: stored.hasSnapshot, lastSuccessfulSyncAt: stored.lastSuccessfulSyncAt } : null
  }

  async saveMetadata(scope: ShoppingScope, metadata: ShoppingSyncMetadata) {
    await writeOne(await this.database(), 'shoppingMetadata', { ...metadata, scopeKey: shoppingScopeKey(scope), userId: scope.userId } satisfies StoredMetadata)
  }

  async saveTemplates(scope: ShoppingScope, templates: ShoppingTemplate[]) {
    await writeOne(await this.database(), 'shoppingTemplates', { scopeKey: shoppingScopeKey(scope), userId: scope.userId, familyId: scope.familyId, templates } satisfies StoredTemplates)
  }

  async loadTemplates(scope: ShoppingScope) {
    return (await readOne<StoredTemplates>(await this.database(), 'shoppingTemplates', shoppingScopeKey(scope)))?.templates ?? []
  }

  async saveCategorySettings(familyId: string, settings: ShoppingCategorySettings) {
    await writeOne(await this.database(), 'shoppingCategorySettings', { familyId, settings } satisfies StoredCategorySettings)
  }

  async loadCategorySettings(familyId: string) {
    return (await readOne<StoredCategorySettings>(await this.database(), 'shoppingCategorySettings', familyId))?.settings ?? null
  }

  async loadFamilyIdentity(userId: string) {
    return (await readOne<StoredFamilyIdentity>(await this.database(), 'shoppingFamilyIdentity', userId))?.member ?? null
  }

  async saveFamilyIdentity(userId: string, member: FamilyMember | null) {
    const db = await this.database()
    const transaction = db.transaction('shoppingFamilyIdentity', 'readwrite')
    const store = transaction.objectStore('shoppingFamilyIdentity')
    if (member) store.put({ userId, member } satisfies StoredFamilyIdentity)
    else store.delete(userId)
    await transactionDone(transaction)
  }

  async loadCalendarSnapshot(scopeKey: string) {
    const stored = (await readOne<StoredCalendarSnapshot>(await this.database(), 'calendarSnapshots', scopeKey)) ?? null
    if (stored && stored.schemaVersion !== CALENDAR_LOCAL_SCHEMA_VERSION) {
      await this.deleteCalendarScope(scopeKey)
      return null
    }
    return stored
  }

  async saveCalendarSnapshot(snapshot: StoredCalendarSnapshot) {
    await writeOne(await this.database(), 'calendarSnapshots', snapshot)
  }

  async loadCalendarMutations(scopeKey: string) {
    const rows = await getAllByIndex<CalendarMutation>(await this.database(), 'calendarMutations', 'scopeKey', scopeKey)
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async replaceCalendarMutations(scopeKey: string, mutations: CalendarMutation[]) {
    const db = await this.database()
    const transaction = db.transaction('calendarMutations', 'readwrite')
    const store = transaction.objectStore('calendarMutations')
    const existing = await request(store.index('scopeKey').getAllKeys(IDBKeyRange.only(scopeKey)))
    for (const key of existing) store.delete(key)
    for (const mutation of mutations) store.put(mutation)
    await transactionDone(transaction)
  }

  async clearCalendarUser(userId: string) {
    const db = await this.database()
    const transaction = db.transaction(['calendarSnapshots', 'calendarMutations'], 'readwrite')
    for (const storeName of ['calendarSnapshots', 'calendarMutations']) {
      const store = transaction.objectStore(storeName)
      const keys = await request(store.index('userId').getAllKeys(IDBKeyRange.only(userId)))
      for (const key of keys) store.delete(key)
    }
    await transactionDone(transaction)
  }

  async clearShoppingUser(userId: string) {
    const db = await this.database()
    const stores = ['shoppingItems', 'shoppingMutations', 'shoppingMetadata', 'shoppingTemplates']
    const transaction = db.transaction(stores, 'readwrite')
    for (const storeName of stores) {
      const store = transaction.objectStore(storeName)
      const keys = await request(store.index('userId').getAllKeys(IDBKeyRange.only(userId)))
      for (const key of keys) store.delete(key)
    }
    await transactionDone(transaction)
  }

  private async deleteCalendarScope(scopeKey: string) {
    const db = await this.database()
    const transaction = db.transaction(['calendarSnapshots', 'calendarMutations'], 'readwrite')
    transaction.objectStore('calendarSnapshots').delete(scopeKey)
    const mutations = transaction.objectStore('calendarMutations')
    const keys = await request(mutations.index('scopeKey').getAllKeys(IDBKeyRange.only(scopeKey)))
    for (const key of keys) mutations.delete(key)
    await transactionDone(transaction)
  }
}

export class MemoryShoppingStore implements ShoppingLocalStore {
  private items = new Map<string, ShoppingItem[]>()
  private mutations = new Map<string, ShoppingMutation[]>()
  private metadata = new Map<string, ShoppingSyncMetadata>()
  private templates = new Map<string, ShoppingTemplate[]>()
  private categories = new Map<string, ShoppingCategorySettings>()
  private identities = new Map<string, FamilyMember>()
  private calendarSnapshots = new Map<string, StoredCalendarSnapshot>()
  private calendarMutations = new Map<string, CalendarMutation[]>()

  async loadItems(scope: ShoppingScope) { return structuredClone(this.items.get(shoppingScopeKey(scope)) ?? []) }
  async replaceItems(scope: ShoppingScope, items: ShoppingItem[]) { this.items.set(shoppingScopeKey(scope), structuredClone(items)) }
  async loadMutations(scope: ShoppingScope) { return structuredClone(this.mutations.get(shoppingScopeKey(scope)) ?? []) }
  async replaceMutations(scope: ShoppingScope, mutations: ShoppingMutation[]) { this.mutations.set(shoppingScopeKey(scope), structuredClone(mutations)) }
  async loadMetadata(scope: ShoppingScope) { return structuredClone(this.metadata.get(shoppingScopeKey(scope)) ?? null) }
  async saveMetadata(scope: ShoppingScope, metadata: ShoppingSyncMetadata) { this.metadata.set(shoppingScopeKey(scope), structuredClone(metadata)) }
  async saveTemplates(scope: ShoppingScope, templates: ShoppingTemplate[]) { this.templates.set(shoppingScopeKey(scope), structuredClone(templates)) }
  async loadTemplates(scope: ShoppingScope) { return structuredClone(this.templates.get(shoppingScopeKey(scope)) ?? []) }
  async saveCategorySettings(familyId: string, settings: ShoppingCategorySettings) { this.categories.set(familyId, structuredClone(settings)) }
  async loadCategorySettings(familyId: string) { return structuredClone(this.categories.get(familyId) ?? null) }
  async loadFamilyIdentity(userId: string) { return structuredClone(this.identities.get(userId) ?? null) }
  async saveFamilyIdentity(userId: string, member: FamilyMember | null) {
    if (member) this.identities.set(userId, structuredClone(member))
    else this.identities.delete(userId)
  }
  async loadCalendarSnapshot(scopeKey: string) {
    const stored = structuredClone(this.calendarSnapshots.get(scopeKey) ?? null)
    if (stored && stored.schemaVersion !== CALENDAR_LOCAL_SCHEMA_VERSION) {
      this.calendarSnapshots.delete(scopeKey)
      this.calendarMutations.delete(scopeKey)
      return null
    }
    return stored
  }
  async saveCalendarSnapshot(snapshot: StoredCalendarSnapshot) { this.calendarSnapshots.set(snapshot.scopeKey, structuredClone(snapshot)) }
  async loadCalendarMutations(scopeKey: string) { return structuredClone(this.calendarMutations.get(scopeKey) ?? []) }
  async replaceCalendarMutations(scopeKey: string, mutations: CalendarMutation[]) { this.calendarMutations.set(scopeKey, structuredClone(mutations)) }
  async clearCalendarUser(userId: string) {
    for (const [scopeKey, snapshot] of this.calendarSnapshots) {
      if (snapshot.userId !== userId) continue
      this.calendarSnapshots.delete(scopeKey)
      this.calendarMutations.delete(scopeKey)
    }
    for (const [scopeKey, mutations] of this.calendarMutations) {
      if (mutations.some((mutation) => mutation.userId === userId)) this.calendarMutations.delete(scopeKey)
    }
  }

  async clearShoppingUser(userId: string) {
    const prefix = `${userId}:`
    for (const map of [this.items, this.mutations, this.metadata, this.templates]) {
      for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key)
    }
  }
}

let sharedStore: OfflineLocalStore | null = null

export function getOfflineLocalStore(): OfflineLocalStore {
  if (!sharedStore) sharedStore = typeof indexedDB === 'undefined' ? new MemoryShoppingStore() : new IndexedDbShoppingStore()
  return sharedStore
}

export function getShoppingLocalStore(): ShoppingLocalStore {
  return getOfflineLocalStore()
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => resolve(open.result)
    open.onupgradeneeded = () => {
      const db = open.result
      // v4 moved shopping from family-only keying to user+family keying.
      // Legacy rows have no userId, so there is no safe way to attribute
      // them to an account — drop them. Everything here is re-syncable from
      // the server, and keeping them is exactly the P0-4 leak.
      for (const legacy of ['shoppingItems', 'shoppingMutations', 'shoppingMetadata', 'shoppingTemplates']) {
        if (db.objectStoreNames.contains(legacy)) db.deleteObjectStore(legacy)
      }
      createScopedStore(db, 'shoppingItems', 'key')
      createScopedStore(db, 'shoppingMutations', 'mutationId')
      createScopedStore(db, 'shoppingMetadata', 'scopeKey')
      createScopedStore(db, 'shoppingTemplates', 'scopeKey')
      if (!db.objectStoreNames.contains('shoppingCategorySettings')) db.createObjectStore('shoppingCategorySettings', { keyPath: 'familyId' })
      if (!db.objectStoreNames.contains('shoppingFamilyIdentity')) db.createObjectStore('shoppingFamilyIdentity', { keyPath: 'userId' })
      createScopedStore(db, 'calendarSnapshots', 'scopeKey')
      createScopedStore(db, 'calendarMutations', 'operationId')
    }
  })
}

function createScopedStore(db: IDBDatabase, name: string, keyPath: string) {
  if (db.objectStoreNames.contains(name)) return
  const store = db.createObjectStore(name, { keyPath })
  store.createIndex('scopeKey', 'scopeKey', { unique: false })
  store.createIndex('familyId', 'familyId', { unique: false })
  store.createIndex('userId', 'userId', { unique: false })
}

async function getAllByIndex<T>(db: IDBDatabase, storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
  const transaction = db.transaction(storeName, 'readonly')
  return request(transaction.objectStore(storeName).index(indexName).getAll(IDBKeyRange.only(value))) as Promise<T[]>
}

async function readOne<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const transaction = db.transaction(storeName, 'readonly')
  return request(transaction.objectStore(storeName).get(key)) as Promise<T | undefined>
}

async function writeOne(db: IDBDatabase, storeName: string, value: unknown) {
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).put(value)
  await transactionDone(transaction)
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function itemKey(scopeKey: string, itemId: string) { return `${scopeKey}:${itemId}` }

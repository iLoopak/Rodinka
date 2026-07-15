import type { ShoppingMutation } from './shoppingMutationQueue'
import type { ShoppingItem, ShoppingTemplate } from '../utils/shopping'
import type { ShoppingCategorySettings } from '../utils/shoppingCategorySettings'
import type { FamilyMember } from '../hooks/useFamilyMembers'

export interface ShoppingSyncMetadata {
  familyId: string
  hasSnapshot: boolean
  lastSuccessfulSyncAt: string | null
}

export interface ShoppingLocalStore {
  loadItems(familyId: string): Promise<ShoppingItem[]>
  replaceItems(familyId: string, items: ShoppingItem[]): Promise<void>
  loadMutations(familyId: string): Promise<ShoppingMutation[]>
  replaceMutations(familyId: string, mutations: ShoppingMutation[]): Promise<void>
  loadMetadata(familyId: string): Promise<ShoppingSyncMetadata | null>
  saveMetadata(metadata: ShoppingSyncMetadata): Promise<void>
  saveTemplates(familyId: string, templates: ShoppingTemplate[]): Promise<void>
  loadTemplates(familyId: string): Promise<ShoppingTemplate[]>
  saveCategorySettings(familyId: string, settings: ShoppingCategorySettings): Promise<void>
  loadCategorySettings(familyId: string): Promise<ShoppingCategorySettings | null>
  loadFamilyIdentity(userId: string): Promise<FamilyMember | null>
  saveFamilyIdentity(userId: string, member: FamilyMember | null): Promise<void>
}

interface StoredItem { key: string; familyId: string; item: ShoppingItem }
interface StoredTemplates { familyId: string; templates: ShoppingTemplate[] }
interface StoredCategorySettings { familyId: string; settings: ShoppingCategorySettings }
interface StoredFamilyIdentity { userId: string; member: FamilyMember }

const DB_NAME = 'rodinka-offline'
const DB_VERSION = 2

export class IndexedDbShoppingStore implements ShoppingLocalStore {
  private databasePromise: Promise<IDBDatabase> | null = null

  private database() {
    if (!this.databasePromise) this.databasePromise = openDatabase()
    return this.databasePromise
  }

  async loadItems(familyId: string) {
    const rows = await getAllByFamily<StoredItem>(await this.database(), 'shoppingItems', familyId)
    return rows.map((row) => row.item)
  }

  async replaceItems(familyId: string, items: ShoppingItem[]) {
    const db = await this.database()
    const transaction = db.transaction('shoppingItems', 'readwrite')
    const store = transaction.objectStore('shoppingItems')
    const existing = await request(store.index('familyId').getAllKeys(IDBKeyRange.only(familyId)))
    for (const key of existing) store.delete(key)
    for (const item of items) store.put({ key: itemKey(familyId, item.id), familyId, item } satisfies StoredItem)
    await transactionDone(transaction)
  }

  async loadMutations(familyId: string) {
    const rows = await getAllByFamily<ShoppingMutation>(await this.database(), 'shoppingMutations', familyId)
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async replaceMutations(familyId: string, mutations: ShoppingMutation[]) {
    const db = await this.database()
    const transaction = db.transaction('shoppingMutations', 'readwrite')
    const store = transaction.objectStore('shoppingMutations')
    const existing = await request(store.index('familyId').getAllKeys(IDBKeyRange.only(familyId)))
    for (const key of existing) store.delete(key)
    for (const mutation of mutations) store.put(mutation)
    await transactionDone(transaction)
  }

  async loadMetadata(familyId: string) {
    return (await readOne<ShoppingSyncMetadata>(await this.database(), 'shoppingMetadata', familyId)) ?? null
  }

  async saveMetadata(metadata: ShoppingSyncMetadata) {
    await writeOne(await this.database(), 'shoppingMetadata', metadata)
  }

  async saveTemplates(familyId: string, templates: ShoppingTemplate[]) {
    await writeOne(await this.database(), 'shoppingTemplates', { familyId, templates } satisfies StoredTemplates)
  }

  async loadTemplates(familyId: string) {
    return (await readOne<StoredTemplates>(await this.database(), 'shoppingTemplates', familyId))?.templates ?? []
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
}

export class MemoryShoppingStore implements ShoppingLocalStore {
  private items = new Map<string, ShoppingItem[]>()
  private mutations = new Map<string, ShoppingMutation[]>()
  private metadata = new Map<string, ShoppingSyncMetadata>()
  private templates = new Map<string, ShoppingTemplate[]>()
  private categories = new Map<string, ShoppingCategorySettings>()
  private identities = new Map<string, FamilyMember>()

  async loadItems(familyId: string) { return structuredClone(this.items.get(familyId) ?? []) }
  async replaceItems(familyId: string, items: ShoppingItem[]) { this.items.set(familyId, structuredClone(items)) }
  async loadMutations(familyId: string) { return structuredClone(this.mutations.get(familyId) ?? []) }
  async replaceMutations(familyId: string, mutations: ShoppingMutation[]) { this.mutations.set(familyId, structuredClone(mutations)) }
  async loadMetadata(familyId: string) { return structuredClone(this.metadata.get(familyId) ?? null) }
  async saveMetadata(metadata: ShoppingSyncMetadata) { this.metadata.set(metadata.familyId, structuredClone(metadata)) }
  async saveTemplates(familyId: string, templates: ShoppingTemplate[]) { this.templates.set(familyId, structuredClone(templates)) }
  async loadTemplates(familyId: string) { return structuredClone(this.templates.get(familyId) ?? []) }
  async saveCategorySettings(familyId: string, settings: ShoppingCategorySettings) { this.categories.set(familyId, structuredClone(settings)) }
  async loadCategorySettings(familyId: string) { return structuredClone(this.categories.get(familyId) ?? null) }
  async loadFamilyIdentity(userId: string) { return structuredClone(this.identities.get(userId) ?? null) }
  async saveFamilyIdentity(userId: string, member: FamilyMember | null) {
    if (member) this.identities.set(userId, structuredClone(member))
    else this.identities.delete(userId)
  }
}

let sharedStore: ShoppingLocalStore | null = null

export function getShoppingLocalStore(): ShoppingLocalStore {
  if (!sharedStore) sharedStore = typeof indexedDB === 'undefined' ? new MemoryShoppingStore() : new IndexedDbShoppingStore()
  return sharedStore
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => resolve(open.result)
    open.onupgradeneeded = () => {
      const db = open.result
      createFamilyStore(db, 'shoppingItems', 'key')
      createFamilyStore(db, 'shoppingMutations', 'mutationId')
      if (!db.objectStoreNames.contains('shoppingMetadata')) db.createObjectStore('shoppingMetadata', { keyPath: 'familyId' })
      if (!db.objectStoreNames.contains('shoppingTemplates')) db.createObjectStore('shoppingTemplates', { keyPath: 'familyId' })
      if (!db.objectStoreNames.contains('shoppingCategorySettings')) db.createObjectStore('shoppingCategorySettings', { keyPath: 'familyId' })
      if (!db.objectStoreNames.contains('shoppingFamilyIdentity')) db.createObjectStore('shoppingFamilyIdentity', { keyPath: 'userId' })
    }
  })
}

function createFamilyStore(db: IDBDatabase, name: string, keyPath: string) {
  if (db.objectStoreNames.contains(name)) return
  const store = db.createObjectStore(name, { keyPath })
  store.createIndex('familyId', 'familyId', { unique: false })
}

async function getAllByFamily<T>(db: IDBDatabase, storeName: string, familyId: string): Promise<T[]> {
  const transaction = db.transaction(storeName, 'readonly')
  return request(transaction.objectStore(storeName).index('familyId').getAll(IDBKeyRange.only(familyId))) as Promise<T[]>
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

function itemKey(familyId: string, itemId: string) { return `${familyId}:${itemId}` }

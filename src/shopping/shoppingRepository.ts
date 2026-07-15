import {
  buildCommonShoppingTemplates,
  findMergeCandidate,
  mergeCompatibleQuantity,
  normalizeShoppingName,
  type ShoppingAddResult,
  type ShoppingBatchResult,
  type ShoppingCategory,
  type ShoppingItem,
  type ShoppingItemInput,
} from '../utils/shopping'
import type { ShoppingLocalStore } from './shoppingIndexedDb'
import {
  applyShoppingMutation,
  applyPendingShoppingMutations,
  enqueueShoppingMutation,
  pendingShoppingItemIds,
  type ShoppingMutation,
  type ShoppingMutationType,
} from './shoppingMutationQueue'
import { subscribeToShoppingRealtime, type ShoppingRealtimeSubscription } from './shoppingRealtime'
import { SupabaseShoppingRemote, synchronizeShopping, type ShoppingRemote } from './shoppingSync'

export type ShoppingSyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

export interface ShoppingRepositorySnapshot {
  ready: boolean
  items: ShoppingItem[]
  pendingItemIds: Set<string>
  pendingCount: number
  status: ShoppingSyncStatus
  lastSuccessfulSyncAt: string | null
  error: string | null
}

interface ShoppingRepositoryOptions {
  familyId: string
  currentMemberId: string
  store: ShoppingLocalStore
  remote?: ShoppingRemote
  realtime?: ShoppingRealtimeSubscription
  isOnline?: () => boolean
  now?: () => Date
  createId?: () => string
}

export class ShoppingRepository {
  private readonly familyId: string
  private readonly currentMemberId: string
  private readonly store: ShoppingLocalStore
  private readonly remote: ShoppingRemote
  private readonly realtime: ShoppingRealtimeSubscription
  private readonly isOnline: () => boolean
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly listeners = new Set<(snapshot: ShoppingRepositorySnapshot) => void>()
  private snapshot: ShoppingRepositorySnapshot
  private mutations: ShoppingMutation[] = []
  private inFlightMutations: ShoppingMutation[] = []
  private localWrite: Promise<void> = Promise.resolve()
  private syncPromise: Promise<void> | null = null
  private stopRealtime: (() => void) | null = null
  private onlineListener = () => { void this.sync() }
  private visibilityListener = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void this.sync() }

  constructor(options: ShoppingRepositoryOptions) {
    this.familyId = options.familyId
    this.currentMemberId = options.currentMemberId
    this.store = options.store
    this.remote = options.remote ?? new SupabaseShoppingRemote()
    this.realtime = options.realtime ?? subscribeToShoppingRealtime
    this.isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine)
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.snapshot = {
      ready: false,
      items: [],
      pendingItemIds: new Set(),
      pendingCount: 0,
      status: this.isOnline() ? 'synced' : 'offline',
      lastSuccessfulSyncAt: null,
      error: null,
    }
  }

  getSnapshot() { return this.snapshot }

  subscribe(listener: (snapshot: ShoppingRepositorySnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  async start() {
    const [items, mutations, metadata] = await Promise.all([
      this.store.loadItems(this.familyId),
      this.store.loadMutations(this.familyId),
      this.store.loadMetadata(this.familyId),
    ])
    this.mutations = mutations
    this.replaceSnapshot({
      ready: true,
      items,
      pendingItemIds: pendingShoppingItemIds(mutations),
      pendingCount: mutations.length,
      status: this.isOnline() ? 'synced' : 'offline',
      lastSuccessfulSyncAt: metadata?.lastSuccessfulSyncAt ?? null,
      error: null,
    })
    this.stopRealtime = this.realtime(this.familyId, () => { void this.sync() })
    if (typeof window !== 'undefined') window.addEventListener('online', this.onlineListener)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityListener)
    void this.sync()
  }

  stop() {
    this.stopRealtime?.()
    this.stopRealtime = null
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onlineListener)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityListener)
  }

  async sync() {
    if (this.syncPromise) return this.syncPromise
    if (!this.isOnline()) {
      this.replaceSnapshot({ ...this.snapshot, status: 'offline', error: null })
      return
    }
    this.syncPromise = this.performSync().then((syncAgain) => {
      this.syncPromise = null
      if (syncAgain && this.isOnline()) this.scheduleSync()
    })
    return this.syncPromise
  }

  private async performSync() {
    this.replaceSnapshot({ ...this.snapshot, status: 'syncing', error: null })
    await this.waitForLocalWrites()
    const uploading = this.mutations
    this.mutations = []
    this.inFlightMutations = uploading
    try {
      const result = await synchronizeShopping(this.familyId, uploading, this.remote)
      this.inFlightMutations = []
      const items = applyPendingShoppingMutations(result.items, this.mutations)
      await this.persistLocal(items, result.lastSuccessfulSyncAt)
      this.replaceSnapshot({
        ready: true,
        items,
        pendingItemIds: pendingShoppingItemIds(this.mutations),
        pendingCount: this.mutations.length,
        status: this.mutations.length > 0 ? 'syncing' : 'synced',
        lastSuccessfulSyncAt: result.lastSuccessfulSyncAt,
        error: null,
      })
      return this.mutations.length > 0
    } catch (error) {
      this.mutations = [...uploading, ...this.mutations]
      this.inFlightMutations = []
      try { await this.persistLocal(this.snapshot.items) }
      catch (persistenceError) { console.error('Failed to preserve the shopping mutation queue:', persistenceError) }
      this.replaceSnapshot({
        ...this.snapshot,
        pendingItemIds: pendingShoppingItemIds(this.mutations),
        pendingCount: this.mutations.length,
        status: this.isOnline() ? 'error' : 'offline',
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  async addItem(input: ShoppingItemInput, forceSeparate = false, source?: { mealId?: string | null; planEntryId?: string | null }): Promise<ShoppingAddResult> {
    const candidate = forceSeparate ? null : findMergeCandidate(this.snapshot.items, input)
    if (candidate) {
      const quantity = mergeCompatibleQuantity(candidate, input)
      if (quantity !== null) {
        await this.updateItem(candidate.id, { ...input, quantity })
        return { action: 'merged', item: this.snapshot.items.find((item) => item.id === candidate.id)! }
      }
      if (candidate.quantity === null && input.quantity === null) return { action: 'existing', item: candidate }
    }

    const timestamp = this.now().toISOString()
    const item: ShoppingItem = {
      id: this.createId(),
      family_id: this.familyId,
      name: input.name.trim(),
      normalized_name: normalizeShoppingName(input.name),
      quantity: input.quantity,
      unit: input.unit,
      note: input.note.trim() || null,
      category: input.category,
      created_by_member_id: this.currentMemberId,
      responsible_member_id: input.responsibleMemberId,
      purchased: false,
      purchased_by_member_id: null,
      purchased_at: null,
      archived_at: null,
      sort_order: 0,
      source_meal_id: source?.mealId ?? null,
      source_meal_plan_entry_id: source?.planEntryId ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    }
    await this.commit(this.mutation('create', item.id, { item }))
    return { action: 'added', item }
  }

  async updateItem(id: string, input: ShoppingItemInput) {
    await this.commit(this.mutation('update', id, {
      name: input.name.trim(),
      normalized_name: normalizeShoppingName(input.name),
      quantity: input.quantity,
      unit: input.unit,
      note: input.note.trim() || null,
      category: input.category,
      responsible_member_id: input.responsibleMemberId,
    }))
  }

  async deleteItem(id: string) { await this.commit(this.mutation('delete', id, {})) }

  async togglePurchased(id: string, purchased: boolean) {
    const timestamp = this.now().toISOString()
    await this.commit(this.mutation('toggle', id, {
      purchased,
      purchasedAt: purchased ? timestamp : null,
      purchasedByMemberId: purchased ? this.currentMemberId : null,
    }, timestamp))
  }

  async reorderItem(movedItemId: string, targetCategory: ShoppingCategory, orderedTargetIds: string[]) {
    await this.commit(this.mutation('reorder', movedItemId, { targetCategory, orderedTargetIds }))
  }

  async archivePurchased() {
    const timestamp = this.now().toISOString()
    const purchased = this.snapshot.items.filter((item) => item.purchased && item.archived_at === null)
    for (const item of purchased) await this.commit(this.mutation('update', item.id, { archived_at: timestamp }, timestamp), false)
    this.scheduleSync()
  }

  async importItems(inputs: ShoppingItemInput[], source?: { mealId?: string | null; planEntryId?: string | null }): Promise<ShoppingBatchResult> {
    const result: ShoppingBatchResult = { added: 0, merged: 0, skipped: 0, failed: 0 }
    for (const input of inputs) {
      try {
        const added = await this.addItem(input, false, source)
        if (added.action === 'added') result.added += 1
        else if (added.action === 'merged') result.merged += 1
        else result.skipped += 1
      } catch { result.failed += 1 }
    }
    return result
  }

  private mutation(type: ShoppingMutationType, itemId: string, payload: Record<string, unknown>, createdAt = this.now().toISOString()): ShoppingMutation {
    return { mutationId: this.createId(), familyId: this.familyId, type, itemId, payload, createdAt }
  }

  private async commit(mutation: ShoppingMutation, sync = true) {
    this.mutations = enqueueShoppingMutation(this.mutations, mutation)
    const items = applyShoppingMutation(this.snapshot.items, mutation)
    this.replaceSnapshot({
      ...this.snapshot,
      ready: true,
      items,
      pendingItemIds: pendingShoppingItemIds([...this.inFlightMutations, ...this.mutations]),
      pendingCount: this.inFlightMutations.length + this.mutations.length,
      status: this.isOnline() ? this.snapshot.status : 'offline',
      error: null,
    })
    await this.persistLocal(items)
    if (sync) this.scheduleSync()
  }

  private persistLocal(items: ShoppingItem[], lastSuccessfulSyncAt = this.snapshot.lastSuccessfulSyncAt) {
    const mutations = [...this.inFlightMutations, ...this.mutations]
    const templates = buildCommonShoppingTemplates(items, items.filter((item) => !item.purchased && item.archived_at === null))
    this.localWrite = this.localWrite.catch(() => undefined).then(async () => {
      await Promise.all([
        this.store.replaceItems(this.familyId, items),
        this.store.replaceMutations(this.familyId, mutations),
        this.store.saveTemplates(this.familyId, templates),
        this.store.saveMetadata({ familyId: this.familyId, hasSnapshot: true, lastSuccessfulSyncAt }),
      ])
    })
    return this.localWrite
  }

  private async waitForLocalWrites() {
    while (true) {
      const pending = this.localWrite
      await pending
      if (pending === this.localWrite) return
    }
  }

  private scheduleSync() { if (this.isOnline()) queueMicrotask(() => { void this.sync() }) }

  private replaceSnapshot(snapshot: ShoppingRepositorySnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener(snapshot)
  }
}

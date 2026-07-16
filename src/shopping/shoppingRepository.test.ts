import { describe, expect, it } from 'vitest'
import type { ShoppingItem, ShoppingItemInput } from '../utils/shopping'
import { MemoryShoppingStore } from './shoppingIndexedDb'
import { applyShoppingMutation, type ShoppingMutation } from './shoppingMutationQueue'
import { ShoppingRepository } from './shoppingRepository'
import type { ShoppingRealtimeSubscription } from './shoppingRealtime'
import type { ShoppingRemote } from './shoppingSync'

const input: ShoppingItemInput = { name: 'Milk', quantity: 1, unit: 'l', note: '', category: 'dairy', responsibleMemberId: null }

class FakeRemote implements ShoppingRemote {
  items: ShoppingItem[] = []
  applied: ShoppingMutation[] = []
  async applyMutation(mutation: ShoppingMutation) {
    this.applied.push(structuredClone(mutation))
    this.items = applyShoppingMutation(this.items, mutation)
  }
  async fetchItems() { return structuredClone(this.items) }
}

function repository(store: MemoryShoppingStore, remote: FakeRemote, isOnline: () => boolean, realtime?: ShoppingRealtimeSubscription) {
  let id = 0
  return new ShoppingRepository({
    familyId: 'family-1', currentMemberId: 'member-1', store, remote, isOnline,
    realtime: realtime ?? (async () => async () => undefined),
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date('2026-07-15T10:00:00Z'),
  })
}

// Captures the onRemoteChange callback the repository registers, so a test
// can simulate an incoming Postgres change notification by invoking it.
function capturingRealtime() {
  let trigger: (() => void) | undefined
  const realtime: ShoppingRealtimeSubscription = async (_familyId, onRemoteChange) => {
    trigger = onRemoteChange
    return async () => { trigger = undefined }
  }
  return { realtime, fire: () => trigger?.() }
}

describe('offline shopping repository', () => {
  it('does not subscribe when stop wins a start that is still loading', async () => {
    const store = new MemoryShoppingStore()
    const originalLoadItems = store.loadItems.bind(store)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    store.loadItems = async (familyId) => { await gate; return originalLoadItems(familyId) }
    let subscriptions = 0
    const realtime: ShoppingRealtimeSubscription = async () => {
      subscriptions += 1
      return async () => undefined
    }
    const repo = repository(store, new FakeRemote(), () => true, realtime)
    const starting = repo.start()
    await repo.stop()
    release()
    await starting
    expect(subscriptions).toBe(0)
  })

  it('makes repeated start and stop calls idempotent', async () => {
    let subscriptions = 0
    let stops = 0
    const realtime: ShoppingRealtimeSubscription = async () => {
      subscriptions += 1
      return async () => { stops += 1 }
    }
    const repo = repository(new MemoryShoppingStore(), new FakeRemote(), () => true, realtime)
    await Promise.all([repo.start(), repo.start()])
    expect(subscriptions).toBe(1)
    await Promise.all([repo.stop(), repo.stop()])
    expect(stops).toBe(1)
  })

  it('persists offline creates and restores both list and queue after an app restart', async () => {
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const first = repository(store, remote, () => false)
    await first.start()
    const result = await first.addItem(input)
    expect(first.getSnapshot()).toMatchObject({ status: 'offline', pendingCount: 1 })
    expect(result.item.id).toMatch(/^00000000-/)
    first.stop()

    const restarted = repository(store, remote, () => false)
    await restarted.start()
    expect(restarted.getSnapshot().items.map((entry) => entry.name)).toEqual(['Milk'])
    expect(restarted.getSnapshot().pendingCount).toBe(1)
    restarted.stop()
  })

  it('synchronizes queued changes after reconnecting without replacing client ids', async () => {
    let online = false
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const repo = repository(store, remote, () => online)
    await repo.start()
    const added = await repo.addItem(input)
    await repo.togglePurchased(added.item.id, true)

    online = true
    await repo.sync()
    expect(remote.items[0]).toMatchObject({ id: added.item.id, purchased: true })
    expect(repo.getSnapshot()).toMatchObject({ status: 'synced', pendingCount: 0 })
    expect(await store.loadMutations('family-1')).toEqual([])
    repo.stop()
  })

  it('reflects an item another client inserted once realtime fires', async () => {
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const { realtime, fire } = capturingRealtime()
    const repo = repository(store, remote, () => true, realtime)
    await repo.start()
    expect(repo.getSnapshot().items).toEqual([])

    remote.items.push({
      id: 'remote-1', family_id: 'family-1', name: 'Eggs', normalized_name: 'eggs', quantity: 6, unit: null, note: null,
      category: 'dairy', created_by_member_id: 'member-2', responsible_member_id: null, purchased: false,
      purchased_by_member_id: null, purchased_at: null, archived_at: null, source_meal_id: null,
      source_meal_plan_entry_id: null, sort_order: 0, created_at: '2026-07-15T10:00:00Z', updated_at: '2026-07-15T10:00:00Z',
    })
    fire()
    await repo.sync()

    expect(repo.getSnapshot().items.map((item) => item.name)).toEqual(['Eggs'])
    repo.stop()
  })

  it('reflects an item another client updated once realtime fires', async () => {
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const { realtime, fire } = capturingRealtime()
    const repo = repository(store, remote, () => true, realtime)
    await repo.start()
    const added = await repo.addItem(input)
    await repo.sync()

    remote.items = remote.items.map((item) => item.id === added.item.id ? { ...item, purchased: true } : item)
    fire()
    await repo.sync()

    expect(repo.getSnapshot().items.find((item) => item.id === added.item.id)?.purchased).toBe(true)
    repo.stop()
  })

  it('reflects an item another client deleted once realtime fires', async () => {
    const store = new MemoryShoppingStore()
    const remote = new FakeRemote()
    const { realtime, fire } = capturingRealtime()
    const repo = repository(store, remote, () => true, realtime)
    await repo.start()
    const added = await repo.addItem(input)
    await repo.sync()
    expect(repo.getSnapshot().items).toHaveLength(1)

    remote.items = remote.items.filter((item) => item.id !== added.item.id)
    fire()
    await repo.sync()

    expect(repo.getSnapshot().items).toHaveLength(0)
    repo.stop()
  })

  it('does not lose rapid consecutive local additions', async () => {
    const store = new MemoryShoppingStore()
    const repo = repository(store, new FakeRemote(), () => false)
    await repo.start()
    await Promise.all([
      repo.addItem({ ...input, name: 'Milk' }),
      repo.addItem({ ...input, name: 'Bread', category: 'bakery', unit: null }),
      repo.addItem({ ...input, name: 'Apples', category: 'produce', unit: 'kg' }),
    ])
    expect(repo.getSnapshot().items.map((entry) => entry.name).sort()).toEqual(['Apples', 'Bread', 'Milk'])
    expect((await store.loadItems('family-1'))).toHaveLength(3)
    repo.stop()
  })
})

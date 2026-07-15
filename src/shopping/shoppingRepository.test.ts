import { describe, expect, it } from 'vitest'
import type { ShoppingItem, ShoppingItemInput } from '../utils/shopping'
import { MemoryShoppingStore } from './shoppingIndexedDb'
import { applyShoppingMutation, type ShoppingMutation } from './shoppingMutationQueue'
import { ShoppingRepository } from './shoppingRepository'
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

function repository(store: MemoryShoppingStore, remote: FakeRemote, isOnline: () => boolean) {
  let id = 0
  return new ShoppingRepository({
    familyId: 'family-1', currentMemberId: 'member-1', store, remote, isOnline,
    realtime: () => () => undefined,
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date('2026-07-15T10:00:00Z'),
  })
}

describe('offline shopping repository', () => {
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

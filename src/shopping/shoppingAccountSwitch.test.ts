import { describe, expect, it } from 'vitest'
import { MemoryShoppingStore } from './shoppingIndexedDb'
import type { ShoppingItem } from '../utils/shopping'
import type { ShoppingMutation } from './shoppingMutationQueue'

const FAMILY = 'family-1'
const USER_A = { userId: 'user-a', familyId: FAMILY }
const USER_B = { userId: 'user-b', familyId: FAMILY }

function item(id: string): ShoppingItem {
  return {
    id, family_id: FAMILY, name: 'Mléko', normalized_name: 'mleko', quantity: 1, unit: 'l',
    note: null, category: 'dairy', created_by_member_id: 'member-a', responsible_member_id: null,
    purchased: false, purchased_by_member_id: null, purchased_at: null, archived_at: null,
    sort_order: 1024, source_meal_id: null, source_meal_plan_entry_id: null,
    created_at: '2026-07-20T09:00:00.000Z', updated_at: '2026-07-20T09:00:00.000Z',
  } as ShoppingItem
}

function mutation(id: string): ShoppingMutation {
  return { mutationId: id, familyId: FAMILY, type: 'create', itemId: id, payload: { item: item(id) }, createdAt: '2026-07-20T09:00:00.000Z' }
}

describe('shopping store account isolation', () => {
  it('does not hand one account the snapshot or queue of another in the same family', async () => {
    const store = new MemoryShoppingStore()
    await store.replaceItems(USER_A, [item('item-a')])
    await store.replaceMutations(USER_A, [mutation('mutation-a')])
    await store.saveMetadata(USER_A, { familyId: FAMILY, hasSnapshot: true, lastSuccessfulSyncAt: '2026-07-20T09:00:00.000Z' })

    // Same device, same family, different account. Keying by familyId alone
    // meant user B started up holding A's items AND replayed A's unsent
    // mutations under B's identity (audit P0-4).
    expect(await store.loadItems(USER_B)).toEqual([])
    expect(await store.loadMutations(USER_B)).toEqual([])
    expect(await store.loadMetadata(USER_B)).toBeNull()
  })

  it('clears a signed-out account without touching the account that stays', async () => {
    const store = new MemoryShoppingStore()
    await store.replaceItems(USER_A, [item('item-a')])
    await store.replaceMutations(USER_A, [mutation('mutation-a')])
    await store.replaceItems(USER_B, [item('item-b')])

    await store.clearShoppingUser(USER_A.userId)

    expect(await store.loadItems(USER_A)).toEqual([])
    expect(await store.loadMutations(USER_A)).toEqual([])
    expect(await store.loadItems(USER_B)).toHaveLength(1)
  })

  it('keeps a user scoped across their own families', async () => {
    const store = new MemoryShoppingStore()
    const otherFamily = { userId: 'user-a', familyId: 'family-2' }
    await store.replaceItems(USER_A, [item('item-a')])
    await store.replaceItems(otherFamily, [item('item-b')])

    // Sign-out clears every family the account cached on this device.
    await store.clearShoppingUser('user-a')
    expect(await store.loadItems(USER_A)).toEqual([])
    expect(await store.loadItems(otherFamily)).toEqual([])
  })
})

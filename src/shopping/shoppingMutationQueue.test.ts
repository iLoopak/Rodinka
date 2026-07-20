import { describe, expect, it } from 'vitest'
import type { ShoppingItem } from '../utils/shopping'
import { applyPendingShoppingMutations, enqueueShoppingMutation, newShoppingMutationState, type ShoppingMutation } from './shoppingMutationQueue'

const item: ShoppingItem = {
  id: 'item-1', family_id: 'family-1', name: 'Milk', normalized_name: 'milk', quantity: 1, unit: 'l', note: null,
  category: 'dairy', created_by_member_id: 'member-1', responsible_member_id: null, purchased: false,
  purchased_by_member_id: null, purchased_at: null, archived_at: null, source_meal_id: null,
  source_meal_plan_entry_id: null, sort_order: 0, created_at: '2026-07-15T10:00:00Z', updated_at: '2026-07-15T10:00:00Z',
}

function mutation(type: ShoppingMutation['type'], payload: Record<string, unknown> = {}): ShoppingMutation {
  return { mutationId: `mutation-${type}`, familyId: 'family-1', type, itemId: item.id, payload, createdAt: '2026-07-15T11:00:00Z', ...newShoppingMutationState() }
}

describe('shopping mutation queue', () => {
  it('folds edits into an offline create without changing the item id', () => {
    const created = mutation('create', { item })
    const queue = enqueueShoppingMutation([created], mutation('toggle', { purchased: true, purchasedAt: '2026-07-15T11:00:00Z' }))
    expect(queue).toHaveLength(1)
    expect((queue[0].payload.item as ShoppingItem)).toMatchObject({ id: item.id, purchased: true })
  })

  it('cancels a locally-created item that is deleted before synchronization', () => {
    expect(enqueueShoppingMutation([mutation('create', { item })], mutation('delete'))).toEqual([])
  })

  it('keeps deletion ahead of older local edits and reapplies pending changes over a server snapshot', () => {
    const queue = enqueueShoppingMutation([mutation('update', { name: 'Oat milk' })], mutation('delete'))
    expect(queue.map((entry) => entry.type)).toEqual(['delete'])
    expect(applyPendingShoppingMutations([item], queue)).toEqual([])
  })
})

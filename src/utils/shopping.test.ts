import { describe, expect, it } from 'vitest'
import {
  buildCommonShoppingTemplates,
  buildShoppingSessions,
  findMergeCandidate,
  formatShoppingQuantity,
  groupShoppingItems,
  ingredientsForImport,
  mergeCompatibleQuantity,
  normalizeShoppingName,
  shoppingItemsForCopy,
  validateShoppingInput,
  type ShoppingItem,
  type ShoppingItemInput,
} from './shopping'

const input: ShoppingItemInput = { name: 'Milk', quantity: 1, unit: 'l', note: '', category: 'dairy', responsibleMemberId: null }
const item: ShoppingItem = {
  id: 'item-1', family_id: 'family-1', name: 'Milk', normalized_name: 'milk', quantity: 1, unit: 'l', note: null,
  category: 'dairy', created_by_member_id: 'member-1', responsible_member_id: null, purchased: false,
  purchased_by_member_id: null, purchased_at: null, archived_at: null, source_meal_id: null,
  source_meal_plan_entry_id: null, created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:00Z',
}

describe('shopping domain', () => {
  it('normalizes whitespace and case without fuzzy matching', () => {
    expect(normalizeShoppingName('  Fresh   MILK ')).toBe('fresh milk')
    expect(normalizeShoppingName('milks')).not.toBe(normalizeShoppingName('milk'))
  })

  it('accepts a valid manual item and rejects blank names', () => {
    expect(validateShoppingInput(input)).toBeNull()
    expect(validateShoppingInput({ ...input, name: '  ' })).toBe('name')
  })

  it('rejects invalid quantities', () => {
    expect(validateShoppingInput({ ...input, quantity: 0 })).toBe('quantity')
  })

  it('finds a normalized active duplicate with compatible unit and note', () => {
    expect(findMergeCandidate([item], { ...input, name: ' MILK ' })?.id).toBe(item.id)
  })

  it('does not match incompatible units or materially different notes', () => {
    expect(findMergeCandidate([item], { ...input, unit: 'pcs' })).toBeNull()
    expect(findMergeCandidate([item], { ...input, note: 'lactose free' })).toBeNull()
  })

  it('merges numeric quantities only when units are compatible', () => {
    expect(mergeCompatibleQuantity(item, { ...input, quantity: 2 })).toBe(3)
    expect(mergeCompatibleQuantity(item, { ...input, unit: 'pcs' })).toBeNull()
  })

  it('formats decimal quantities separately from names', () => {
    expect(formatShoppingQuantity(1.5, 'kg')).toBe('1.5 kg')
    expect(formatShoppingQuantity(6, 'pcs')).toBe('6 pcs')
  })

  it('groups active items in stable store order', () => {
    const groups = groupShoppingItems([{ ...item, category: 'dairy' }, { ...item, id: '2', category: 'produce' }])
    expect(groups.map((group) => group.category)).toEqual(['produce', 'dairy'])
  })

  it('builds common templates while excluding active duplicates', () => {
    const history = [{ ...item, purchased: true, purchased_at: '2026-07-01T10:00:00Z' }]
    expect(buildCommonShoppingTemplates(history, [])).toHaveLength(1)
    expect(buildCommonShoppingTemplates(history, [item])).toHaveLength(0)
  })

  it('groups purchased history into bounded sessions', () => {
    const history = [
      { ...item, id: '1', purchased: true, purchased_at: '2026-07-01T10:00:00Z' },
      { ...item, id: '2', purchased: true, purchased_at: '2026-07-01T14:00:00Z' },
      { ...item, id: '3', purchased: true, purchased_at: '2026-07-02T10:00:00Z' },
    ]
    expect(buildShoppingSessions(history).map((session) => [session.key, session.items.length])).toEqual([
      ['2026-07-02', 1], ['2026-07-01', 2],
    ])
  })

  it('copies history as new active inputs without old attribution', () => {
    expect(shoppingItemsForCopy([item])[0]).toMatchObject({ name: 'Milk', responsibleMemberId: null })
    expect(shoppingItemsForCopy([item])[0]).not.toHaveProperty('created_by_member_id')
  })

  it('converts selected meal ingredients into shopping inputs', () => {
    expect(ingredientsForImport([{ name: 'Flour', quantity: 1, unit: 'kg', note: '', category: 'bakery' }]))
      .toEqual([{ name: 'Flour', quantity: 1, unit: 'kg', note: '', category: 'bakery', responsibleMemberId: null }])
  })
})

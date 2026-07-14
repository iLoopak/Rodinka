import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShoppingItem } from '../utils/shopping'

const useFamilyDataMock = vi.hoisted(() => vi.fn())
vi.mock('../context/FamilyDataContext', () => ({ useFamilyData: useFamilyDataMock }))

import { ShoppingScreen } from './ShoppingScreen'

const member = {
  id: 'member-1', family_id: 'family-1', display_name: 'Alex', role: 'parent' as const,
  user_id: 'user-1', birth_date: null, color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null,
}
const responsible = { ...member, id: 'member-2', display_name: 'Sam', user_id: 'user-2' }
const baseItem: ShoppingItem = {
  id: 'item-1', family_id: 'family-1', name: 'Milk', normalized_name: 'milk', quantity: 2, unit: 'l', note: 'whole',
  category: 'dairy', created_by_member_id: member.id, responsible_member_id: responsible.id, purchased: false,
  purchased_by_member_id: null, purchased_at: null, archived_at: null, source_meal_id: null,
  source_meal_plan_entry_id: null, created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:00Z',
}

function context(active: ShoppingItem[], purchased: ShoppingItem[] = []) {
  const members = [member, responsible]
  return {
    members,
    memberById: (id: string) => members.find((entry) => entry.id === id),
    activeShoppingItems: active,
    purchasedShoppingItems: purchased,
    commonShoppingItems: [],
    shoppingSessions: [],
    shoppingLoading: false,
    shoppingError: null,
    refreshShopping: vi.fn(),
    addShoppingItem: vi.fn(), updateShoppingItem: vi.fn(), deleteShoppingItem: vi.fn(),
    toggleShoppingPurchased: vi.fn(), archivePurchasedShoppingItems: vi.fn(), importShoppingItems: vi.fn(),
  }
}

describe('ShoppingScreen', () => {
  beforeEach(() => useFamilyDataMock.mockReset())

  it('renders quick add, category grouping, creator and responsibility context', () => {
    useFamilyDataMock.mockReturnValue(context([baseItem]))
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    expect(html).toContain('Co potřebujete koupit?')
    expect(html).toContain('Mléčné')
    expect(html).toContain('Přidal/a Alex')
    expect(html).toContain('Nakoupí Sam')
    expect(html).toContain('2 l')
  })

  it('separates purchased items into the secondary section', () => {
    const purchased = { ...baseItem, id: 'item-2', purchased: true, purchased_at: '2026-07-01T12:00:00Z', purchased_by_member_id: member.id }
    useFamilyDataMock.mockReturnValue(context([], [purchased]))
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    expect(html).toContain('Koupeno (1)')
    expect(html).toContain('Všechno je koupené.')
  })

  it('renders the useful completely empty state', () => {
    useFamilyDataMock.mockReturnValue(context([]))
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    expect(html).toContain('Seznam je zatím prázdný')
    expect(html).toContain('Přidejte první položku')
  })
})

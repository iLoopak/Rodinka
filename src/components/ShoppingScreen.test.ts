import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShoppingItem } from '../utils/shopping'
import { defaultShoppingCategorySettings } from '../utils/shoppingCategorySettings'

const useFamilyDataMock = vi.hoisted(() => vi.fn())
vi.mock('../context/FamilyDataContext', () => ({ useFamilyData: useFamilyDataMock }))

import { ShoppingScreen } from './ShoppingScreen'

const member = {
  id: 'member-1', family_id: 'family-1', display_name: 'Alex', role: 'parent' as const,
  user_id: 'user-1', birth_date: null, color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null,
}
const responsible = { ...member, id: 'member-2', display_name: 'Sam', user_id: 'user-2' }
const baseItem: ShoppingItem = {
  id: 'item-1', family_id: 'family-1', name: 'Milk', normalized_name: 'milk', quantity: 2, unit: 'l', note: 'whole',
  category: 'dairy', created_by_member_id: member.id, responsible_member_id: responsible.id, purchased: false,
  purchased_by_member_id: null, purchased_at: null, archived_at: null, source_meal_id: null,
  source_meal_plan_entry_id: null, sort_order: 0, created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:00Z',
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
    shoppingSyncStatus: 'synced',
    shoppingSyncError: null,
    pendingShoppingChanges: 0,
    pendingShoppingItemIds: new Set<string>(),
    shoppingLastSyncedAt: null,
    refreshShopping: vi.fn(),
    addShoppingItem: vi.fn(), updateShoppingItem: vi.fn(), deleteShoppingItem: vi.fn(),
    toggleShoppingPurchased: vi.fn(), archivePurchasedShoppingItems: vi.fn(), importShoppingItems: vi.fn(),
    reorderShoppingItems: vi.fn(),
    shoppingCategorySettings: defaultShoppingCategorySettings(),
    updateShoppingCategorySettings: vi.fn(),
    isParentOrAdmin: true,
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
    expect(html).toContain('list-drag-handle')
    expect(html).toContain('aria-roledescription="sortable"')
    expect(html).toContain('--shopping-accent:#5E83B5')
    expect(html).toContain('aria-controls="shopping-tools-panel"')
    expect(html).toContain('id="shopping-tools-panel"')
    expect(html).toContain('hidden=""')
    expect(html).toContain('Přesunout položku Milk')
    expect(html).toMatch(/class="completion-checkbox"[^>]*><span aria-hidden="true"><\/span><\/button>/)
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

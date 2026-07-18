import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShoppingItem } from '../utils/shopping'
import { defaultShoppingCategorySettings } from '../utils/shoppingCategorySettings'

const useFamilyCoreMock = vi.hoisted(() => vi.fn())
const useFamilyMembersDataMock = vi.hoisted(() => vi.fn())
const useFamilySettingsMock = vi.hoisted(() => vi.fn())
const useShoppingMock = vi.hoisted(() => vi.fn())
const openCreateRecordMock = vi.hoisted(() => vi.fn())
vi.mock('../context/family/FamilyCoreContext', () => ({ useFamilyCore: useFamilyCoreMock }))
vi.mock('../context/family/FamilyMembersContext', () => ({ useFamilyMembersData: useFamilyMembersDataMock }))
vi.mock('../context/family/FamilySettingsContext', () => ({ useFamilySettings: useFamilySettingsMock }))
vi.mock('../context/shopping/ShoppingContext', () => ({ useShopping: useShoppingMock }))
vi.mock('../context/create-record/CreateRecordContext', () => ({ useCreateRecord: () => ({ openCreateRecord: openCreateRecordMock }) }))

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

function mockContexts(active: ShoppingItem[], purchased: ShoppingItem[] = [], child = false) {
  const members = [member, responsible]
  const actor = child ? { ...member, role: 'child' as const } : member
  useFamilyCoreMock.mockReturnValue({
    familyId: 'family-1', userId: 'user-1', userEmail: 'alex@example.com', currentMember: actor, isParentOrAdmin: !child,
  })
  useFamilyMembersDataMock.mockReturnValue({
    members, memberById: (id: string) => members.find((entry) => entry.id === id),
  })
  useFamilySettingsMock.mockReturnValue({
    shoppingCategorySettings: defaultShoppingCategorySettings(),
    updateShoppingCategorySettings: vi.fn(),
  })
  useShoppingMock.mockReturnValue({
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
  })
}

describe('ShoppingScreen', () => {
  beforeEach(() => {
    useFamilyCoreMock.mockReset()
    useFamilyMembersDataMock.mockReset()
    useFamilySettingsMock.mockReset()
    useShoppingMock.mockReset()
  })

  it('renders quick add, category grouping, creator and responsibility context', () => {
    mockContexts([baseItem])
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
    mockContexts([], [purchased])
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    expect(html).toContain('Koupeno (1)')
    expect(html).toContain('Všechno je koupené.')
  })

  it('renders the useful completely empty state', () => {
    mockContexts([])
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    expect(html).toContain('Seznam je zatím prázdný')
    expect(html).toContain('Přidejte první položku')
  })

  it('keeps child shopping to quick add and toggling without management controls', () => {
    mockContexts([baseItem], [], true)
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    expect(html).toContain('completion-checkbox')
    expect(html).toContain('shopping-item-main')
    expect(html).not.toContain('list-drag-handle')
    expect(html).not.toContain('aria-controls="shopping-tools-panel"')
    expect(html).not.toContain('aria-roledescription="sortable"')
    expect(html).not.toMatch(/<button[^>]*class="shopping-item-main"/)
  })
})

describe('ShoppingScreen row layout', () => {
  beforeEach(() => vi.clearAllMocks())

  // .shopping-item is a three-column grid (drag handle, checkbox, content) and
  // the handle only renders for a sortable adult row. Without a modifier the
  // child's name lands in the 44px checkbox column and wraps one character per
  // line.
  it('marks a child active row as having no drag handle', () => {
    mockContexts([baseItem], [], true)
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    const row = /<li class="([^"]*shopping-item[^"]*)"/.exec(html)?.[1] ?? ''
    expect(row).toContain('no-drag-handle')
    expect(html).not.toContain('list-drag-handle')
  })

  it('keeps the drag handle and full grid for an adult active row', () => {
    mockContexts([baseItem])
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    const row = /<li class="([^"]*shopping-item[^"]*)"/.exec(html)?.[1] ?? ''
    expect(row).not.toContain('no-drag-handle')
    expect(html).toContain('list-drag-handle')
  })

  it('marks a purchased row as having no drag handle for either role', () => {
    mockContexts([], [{ ...baseItem, purchased: true }])
    const html = renderToStaticMarkup(createElement(ShoppingScreen))
    const row = /<li class="([^"]*shopping-item[^"]*)"/.exec(html)?.[1] ?? ''
    expect(row).toContain('no-drag-handle')
  })
})

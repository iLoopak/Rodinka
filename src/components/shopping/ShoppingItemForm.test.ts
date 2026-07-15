import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ShoppingItemForm } from './ShoppingItemForm'
import type { ShoppingItem } from '../../utils/shopping'
import { defaultShoppingCategorySettings } from '../../utils/shoppingCategorySettings'

const members = [{
  id: 'member-1', family_id: 'family-1', display_name: 'Alex', role: 'parent' as const,
  user_id: 'user-1', birth_date: null, color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null,
}]

const item: ShoppingItem = {
  id: 'item-1', family_id: 'family-1', name: 'Milk', normalized_name: 'milk', quantity: 2, unit: 'l', note: 'whole',
  category: 'dairy', created_by_member_id: 'member-1', responsible_member_id: 'member-1', purchased: false,
  purchased_by_member_id: null, purchased_at: null, archived_at: null, source_meal_id: null,
  source_meal_plan_entry_id: null, sort_order: 0, created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:00Z',
}

describe('ShoppingItemForm', () => {
  it('renders quick detail fields, localized categories and family responsibility', () => {
    const html = renderToStaticMarkup(createElement(ShoppingItemForm, { members, onSubmit: vi.fn() }))
    expect(html).toContain('Ovoce a zelenina')
    expect(html).toContain('Množství')
    expect(html).toContain('Jednotka')
    expect(html).toContain('Alex')
  })

  it('prefills edit values independently from the item name', () => {
    const html = renderToStaticMarkup(createElement(ShoppingItemForm, { initial: item, members, onSubmit: vi.fn(), onDelete: vi.fn() }))
    expect(html).toContain('value="Milk"')
    expect(html).toContain('value="2"')
    expect(html).toContain('>whole</textarea>')
    expect(html).toContain('Smazat')
  })

  it('uses household-specific category names without changing stored category values', () => {
    const categorySettings = defaultShoppingCategorySettings()
    categorySettings.dairy.label = 'Chlazené'
    const html = renderToStaticMarkup(createElement(ShoppingItemForm, { members, categorySettings, onSubmit: vi.fn() }))

    expect(html).toContain('<option value="dairy">Chlazené</option>')
  })
})

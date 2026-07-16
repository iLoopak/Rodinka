import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ShoppingItem } from '../../utils/shopping'
import { TodayShoppingWidget } from './TodayShoppingWidget'

function item(id: string, name: string, quantity: number | null = null): ShoppingItem {
  return {
    id, name, quantity, family_id: 'family-1', normalized_name: name.toLowerCase(), unit: quantity === null ? null : 'pcs',
    note: null, category: 'other', created_by_member_id: null, responsible_member_id: null,
    purchased: false, purchased_by_member_id: null, purchased_at: null, archived_at: null,
    source_meal_id: null, source_meal_plan_entry_id: null, sort_order: 0, created_at: '2026-07-15T08:00:00Z', updated_at: '2026-07-15T08:00:00Z',
  }
}

describe('TodayShoppingWidget', () => {
  it('shows a compact three-item preview and remaining count', () => {
    const html = renderToStaticMarkup(createElement(TodayShoppingWidget, {
      items: [item('1', 'Mléko', 2), item('2', 'Chléb'), item('3', 'Jablka'), item('4', 'Mýdlo')],
      loading: false, hasUsableData: true, syncStatus: 'synced',
      onOpen: vi.fn(),
      onAddItem: vi.fn(),
    }))

    expect(html).toContain('data-preview-count="3"')
    expect(html).toContain('Mléko')
    expect(html).toContain('2 ks')
    expect(html).toContain('Chléb')
    expect(html).toContain('Jablka')
    expect(html).not.toContain('Mýdlo')
    expect(html).toContain('+1 další')
  })

  it('renders a calm empty state while keeping the open action', () => {
    const html = renderToStaticMarkup(createElement(TodayShoppingWidget, { items: [], loading: false, hasUsableData: true, syncStatus: 'synced', onOpen: vi.fn(), onAddItem: vi.fn() }))

    expect(html).toContain('Nákupní seznam je prázdný.')
    expect(html).toContain('Otevřít seznam')
    expect(html).toContain('Přidat na nákupní seznam…')
  })

  it('does not show a false empty state when initialization fails without usable data', () => {
    const html = renderToStaticMarkup(createElement(TodayShoppingWidget, {
      items: [], loading: false, hasUsableData: false, syncStatus: 'error', onOpen: vi.fn(), onAddItem: vi.fn(),
    }))
    expect(html).toContain('Nákupní seznam se teď nepodařilo načíst')
    expect(html).not.toContain('Nákupní seznam je prázdný.')
  })

  it('keeps cached items visible during a synchronization failure', () => {
    const html = renderToStaticMarkup(createElement(TodayShoppingWidget, {
      items: [item('1', 'Mléko')], loading: false, hasUsableData: true, syncStatus: 'error', onOpen: vi.fn(), onAddItem: vi.fn(),
    }))
    expect(html).toContain('Mléko')
    expect(html).toContain('Zobrazuji uložený seznam')
    expect(html).not.toContain('Nákupní seznam je prázdný.')
  })
})

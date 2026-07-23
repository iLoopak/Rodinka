// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShoppingItem } from '../../utils/shopping'
import { TodayShoppingWidget } from './TodayShoppingWidget'
import { t } from '../../strings'

function item(id: string, name: string): ShoppingItem {
  return {
    id, name, quantity: null, family_id: 'family-1', normalized_name: name.toLowerCase(), unit: null,
    note: null, category: 'other', created_by_member_id: null, responsible_member_id: null,
    purchased: false, purchased_by_member_id: null, purchased_at: null, archived_at: null,
    source_meal_id: null, source_meal_plan_entry_id: null, sort_order: 0, created_at: '2026-07-15T08:00:00Z', updated_at: '2026-07-15T08:00:00Z',
  }
}

// Mirrors what the real Today dashboard does: `items` is the parent's own
// `activeShoppingItems` state, which the shared shopping mutation naturally
// shrinks once an item is marked purchased. This harness fakes just that
// wiring so the widget's own responsibility — calling the mutation, and
// reacting to whatever `items` it's handed next — is what's under test.
function Harness({ onToggle }: { onToggle: (id: string, purchased: boolean) => Promise<void> }) {
  const [items, setItems] = useState<ShoppingItem[]>([item('1', 'Mléko'), item('2', 'Jablka')])
  return (
    <TodayShoppingWidget
      items={items}
      loading={false}
      hasUsableData
      syncStatus="synced"
      onOpen={vi.fn()}
      onAddItem={vi.fn()}
      onTogglePurchased={async (id, purchased) => {
        await onToggle(id, purchased)
        if (purchased) setItems((current) => current.filter((candidate) => candidate.id !== id))
      }}
    />
  )
}

describe('TodayShoppingWidget checkbox interaction', () => {
  afterEach(cleanup)

  it('marks the item bought through the shared mutation, removes it, and updates the count', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<Harness onToggle={onToggle} />)

    screen.getByText('Mléko')
    screen.getByText(t.shopping.activeCount(2))

    fireEvent.click(screen.getByRole('button', { name: t.today.quickShoppingItemBought('Mléko') }))
    await vi.waitFor(() => expect(onToggle).toHaveBeenCalledWith('1', true))

    await vi.waitFor(() => expect(screen.queryByText('Mléko')).toBeNull())
    screen.getByText('Jablka')
    screen.getByText(t.shopping.activeCount(1))
  })

  it('shows the empty state once the last active item is checked off', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<TodayShoppingWidget
      items={[item('1', 'Mléko')]}
      loading={false}
      hasUsableData
      syncStatus="synced"
      onOpen={vi.fn()}
      onAddItem={vi.fn()}
      onTogglePurchased={onToggle}
    />)

    fireEvent.click(screen.getByRole('button', { name: t.today.quickShoppingItemBought('Mléko') }))
    await vi.waitFor(() => expect(onToggle).toHaveBeenCalledWith('1', true))

    // Re-render with an empty list, the way the real parent would once the
    // shared shopping state drops the purchased item.
    rerender(<TodayShoppingWidget
      items={[]}
      loading={false}
      hasUsableData
      syncStatus="synced"
      onOpen={vi.fn()}
      onAddItem={vi.fn()}
      onTogglePurchased={onToggle}
    />)
    screen.getByText(t.today.shoppingEmpty)
  })

  it('rolls back and surfaces the existing error feedback when the mutation fails', async () => {
    const onToggle = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined)
    render(<Harness onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: t.today.quickShoppingItemBought('Mléko') }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(t.shopping.actionFailed)
    // Item was never optimistically removed by this harness on failure, and
    // the widget issues the reverse mutation as its rollback.
    screen.getByText('Mléko')
    await vi.waitFor(() => expect(onToggle).toHaveBeenNthCalledWith(2, '1', false))
  })
})

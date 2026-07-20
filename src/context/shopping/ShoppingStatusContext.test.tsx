// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

let updateItems: (() => void) | undefined
let setStatus: ((status: 'synced' | 'offline') => void) | undefined

vi.mock('./useShoppingDataSource', async () => {
  const { useState } = await import('react')
  return {
    useShoppingDataSource: () => {
      const [items, setItems] = useState<string[]>([])
      const [shoppingSyncStatus, updateStatus] = useState<'synced' | 'offline'>('synced')
      updateItems = () => setItems((current) => [...current, `item-${current.length + 1}`])
      setStatus = updateStatus
      return { shoppingItems: items, shoppingSyncStatus }
    },
  }
})

const { ShoppingProvider, useShoppingSyncStatus } = await import('./ShoppingContext')

afterEach(() => {
  cleanup()
  updateItems = undefined
  setStatus = undefined
})

describe('Shopping status boundary', () => {
  it('does not propagate item changes but does propagate an actual sync-status change', () => {
    let renders = 0
    function HeaderStatusProbe() {
      useShoppingSyncStatus()
      renders += 1
      return null
    }
    function Wrapper({ children }: { children: ReactNode }) {
      return <ShoppingProvider familyId="family-1" userId="user-1" currentMemberId="member-1">{children}</ShoppingProvider>
    }

    render(<Wrapper><HeaderStatusProbe /></Wrapper>)
    expect(renders).toBe(1)

    act(() => updateItems?.())
    expect(renders).toBe(1)

    act(() => setStatus?.('offline'))
    expect(renders).toBe(2)
  })
})

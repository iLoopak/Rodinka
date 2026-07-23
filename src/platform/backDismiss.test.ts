import { describe, expect, it, beforeEach, vi } from 'vitest'
import { dismissTopmost, hasDismissable, registerDismissable, resetBackDismissForTests } from './backDismiss'

describe('backDismiss stack', () => {
  beforeEach(() => resetBackDismissForTests())

  it('reports nothing dismissable when empty', () => {
    expect(hasDismissable()).toBe(false)
    expect(dismissTopmost()).toBe(false)
  })

  it('dismisses the most recently registered entry first', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerDismissable(first)
    registerDismissable(second)

    expect(hasDismissable()).toBe(true)
    expect(dismissTopmost()).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()

    expect(dismissTopmost()).toBe(true)
    expect(first).toHaveBeenCalledTimes(1)

    expect(hasDismissable()).toBe(false)
  })

  it('lets an entry unregister itself out of order', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerDismissable(first)
    registerDismissable(second)

    unregisterFirst()
    expect(dismissTopmost()).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(hasDismissable()).toBe(false)
  })
})

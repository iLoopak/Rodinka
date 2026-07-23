import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { onActivateKey } from './a11y'

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

describe('onActivateKey', () => {
  it('activates and prevents the default for Enter and Space', () => {
    for (const key of ['Enter', ' ']) {
      const onActivate = vi.fn()
      const event = keyEvent(key)
      onActivateKey(onActivate)(event)
      expect(onActivate).toHaveBeenCalledTimes(1)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
    }
  })

  it('ignores other keys without activating or preventing the default', () => {
    for (const key of ['Tab', 'Escape', 'a', 'ArrowDown', 'Spacebar']) {
      const onActivate = vi.fn()
      const event = keyEvent(key)
      onActivateKey(onActivate)(event)
      expect(onActivate).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
  })

  it('returns a reusable handler that fires once per keypress', () => {
    const onActivate = vi.fn()
    const handler = onActivateKey(onActivate)
    handler(keyEvent('Enter'))
    handler(keyEvent(' '))
    handler(keyEvent('x'))
    expect(onActivate).toHaveBeenCalledTimes(2)
  })
})

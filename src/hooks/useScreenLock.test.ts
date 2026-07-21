// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useScreenLock } from './useScreenLock'

describe('useScreenLock', () => {
  it('locks on mount and unlocks on unmount', () => {
    const { unmount } = renderHook(() => useScreenLock())
    expect(document.body.classList.contains('has-modal-open')).toBe(true)
    unmount()
    expect(document.body.classList.contains('has-modal-open')).toBe(false)
  })

  it('stays locked while a second consumer is still mounted (nested surfaces)', () => {
    // Models a modal opened over the fullscreen chat: both hold the lock,
    // and whichever unmounts first must not clear it out from under the other.
    const outer = renderHook(() => useScreenLock())
    const inner = renderHook(() => useScreenLock())
    expect(document.body.classList.contains('has-modal-open')).toBe(true)

    inner.unmount()
    expect(document.body.classList.contains('has-modal-open')).toBe(true)

    outer.unmount()
    expect(document.body.classList.contains('has-modal-open')).toBe(false)
  })

  it('never lets the count go negative from an unbalanced unmount', () => {
    const a = renderHook(() => useScreenLock())
    a.unmount()
    expect(document.body.classList.contains('has-modal-open')).toBe(false)

    const b = renderHook(() => useScreenLock())
    expect(document.body.classList.contains('has-modal-open')).toBe(true)
    b.unmount()
    expect(document.body.classList.contains('has-modal-open')).toBe(false)
  })
})

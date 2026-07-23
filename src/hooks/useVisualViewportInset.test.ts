// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useVisualViewportInset } from './useVisualViewportInset'

class FakeVisualViewport extends EventTarget {
  height: number
  offsetTop: number
  constructor(height: number, offsetTop = 0) {
    super()
    this.height = height
    this.offsetTop = offsetTop
  }
}

const originalVisualViewport = window.visualViewport
const originalInnerHeight = window.innerHeight

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: originalVisualViewport, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  document.documentElement.style.removeProperty('--keyboard-inset')
})

describe('useVisualViewportInset', () => {
  it('is a no-op when visualViewport is unsupported', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    const { unmount } = renderHook(() => useVisualViewportInset())
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('')
    unmount()
  })

  it('publishes the covered height as --keyboard-inset, then clears it on unmount', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const viewport = new FakeVisualViewport(500)
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })

    const { unmount } = renderHook(() => useVisualViewportInset())
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('300px')

    unmount()
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('')
  })

  it('updates on visualViewport resize', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const viewport = new FakeVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })

    const { unmount } = renderHook(() => useVisualViewportInset())
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px')

    viewport.height = 480
    viewport.dispatchEvent(new Event('resize'))
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('320px')

    unmount()
  })

  it('keeps the var set while a second consumer is still mounted', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const viewport = new FakeVisualViewport(500)
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })

    const outer = renderHook(() => useVisualViewportInset())
    const inner = renderHook(() => useVisualViewportInset())
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('300px')

    inner.unmount()
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('300px')

    outer.unmount()
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('')
  })
})

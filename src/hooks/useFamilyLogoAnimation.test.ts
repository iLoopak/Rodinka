// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFamilyLogoAnimation } from './useFamilyLogoAnimation'

afterEach(() => {
  vi.useRealTimers()
})

describe('useFamilyLogoAnimation', () => {
  it('keeps reconnecting until the connection is fully ready, then celebrates once', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ interrupted, ready }) => useFamilyLogoAnimation({
        baseMode: 'member-focus',
        connectionInterrupted: interrupted,
        connectionReady: ready,
      }),
      { initialProps: { interrupted: true, ready: false } },
    )

    expect(result.current).toBe('reconnecting')

    rerender({ interrupted: false, ready: false })
    expect(result.current).toBe('reconnecting')

    rerender({ interrupted: false, ready: true })
    expect(result.current).toBe('connection-restored')

    act(() => vi.advanceTimersByTime(1100))
    expect(result.current).toBe('member-focus')
  })

  it('switches from its contextual mode to reconnecting after a later interruption', () => {
    const { result, rerender } = renderHook(
      ({ interrupted }) => useFamilyLogoAnimation({
        baseMode: 'idle',
        connectionInterrupted: interrupted,
        connectionReady: !interrupted,
      }),
      { initialProps: { interrupted: false } },
    )

    expect(result.current).toBe('idle')
    rerender({ interrupted: true })
    expect(result.current).toBe('reconnecting')
  })
})

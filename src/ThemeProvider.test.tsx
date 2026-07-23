/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './themeContext'
import { ThemeProvider } from './ThemeProvider'
import { THEME_STORAGE_KEY } from './theme'

function installMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      get matches() { return matches },
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    })),
  })
  return (next: boolean) => {
    matches = next
    listeners.forEach((listener) => listener())
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.head.innerHTML = '<meta name="theme-color" content="#FFF8F2">'
    document.documentElement.dataset.theme = ''
  })

  it('uses system by default and reacts to runtime system changes', () => {
    const setSystemDark = installMatchMedia(false)
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.preference).toBe('system')
    expect(result.current.resolvedTheme).toBe('light')
    act(() => setSystemDark(true))
    expect(result.current.resolvedTheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('persists manual dark and ignores later system changes', () => {
    const setSystemDark = installMatchMedia(false)
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setThemePreference('dark'))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(result.current.resolvedTheme).toBe('dark')
    act(() => setSystemDark(false))
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('restores manual light after provider remount', () => {
    installMatchMedia(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.preference).toBe('light')
    expect(result.current.resolvedTheme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

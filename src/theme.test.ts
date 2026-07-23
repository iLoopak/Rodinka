/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { DARK_THEME_COLOR, LIGHT_THEME_COLOR, applyResolvedTheme, normalizeThemePreference, readStoredThemePreference, resolveTheme } from './theme'

describe('theme model', () => {
  it('defaults invalid or missing stored values to system', () => {
    expect(normalizeThemePreference(null)).toBe('system')
    expect(normalizeThemePreference('legacy')).toBe('system')
    expect(readStoredThemePreference(undefined)).toBe('system')
  })

  it('keeps explicit light and dark preferences', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('resolves system from prefers-color-scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('applies data-theme and theme-color meta', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#x">'
    applyResolvedTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(DARK_THEME_COLOR)
    applyResolvedTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(LIGHT_THEME_COLOR)
  })
})

import { describe, expect, it } from 'vitest'
import { defaultShoppingCategorySettings, normalizeShoppingCategorySettings } from './shoppingCategorySettings'

describe('shopping category settings', () => {
  it('provides a distinct valid accent for every stable category', () => {
    const settings = defaultShoppingCategorySettings()
    const colors = Object.values(settings).map((entry) => entry.color)

    expect(new Set(colors).size).toBe(colors.length)
    expect(colors.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true)
  })

  it('normalizes custom labels and colors while preserving safe defaults', () => {
    const settings = normalizeShoppingCategorySettings({
      dairy: { label: '  Chlazené  ', color: '#abc123' },
      meat: { label: '', color: 'red' },
      unsupported: { label: 'Ignored', color: '#000000' },
    })

    expect(settings.dairy).toEqual({ label: 'Chlazené', color: '#ABC123' })
    expect(settings.meat.label).toBeNull()
    expect(settings.meat.color).toBe(defaultShoppingCategorySettings().meat.color)
    expect(settings).not.toHaveProperty('unsupported')
  })

  it('falls back safely when persisted JSON is missing or malformed', () => {
    expect(normalizeShoppingCategorySettings(null)).toEqual(defaultShoppingCategorySettings())
    expect(normalizeShoppingCategorySettings('invalid')).toEqual(defaultShoppingCategorySettings())
  })
})

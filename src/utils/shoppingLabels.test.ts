import { describe, expect, it } from 'vitest'
import { formatLocalizedShoppingQuantity } from './shoppingLabels'

describe('formatLocalizedShoppingQuantity', () => {
  it('uses the localized unit label', () => {
    expect(formatLocalizedShoppingQuantity(3, 'pcs')).toBe('3 ks')
  })

  it('supports quantities and units independently', () => {
    expect(formatLocalizedShoppingQuantity(1.5, null)).toBe('1.5')
    expect(formatLocalizedShoppingQuantity(null, 'pack')).toBe('balení')
  })
})

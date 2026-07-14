import { describe, expect, it } from 'vitest'
import { formatLocalizedShoppingQuantity } from './shoppingLabels'
import { changeLanguage } from '../i18n'

describe('formatLocalizedShoppingQuantity', () => {
  it('uses the localized unit label', () => {
    expect(formatLocalizedShoppingQuantity(3, 'pcs')).toBe('3 ks')
  })

  it('supports localized quantities and units independently', async () => {
    await changeLanguage('cs')
    expect(formatLocalizedShoppingQuantity(1.5, null)).toBe('1,5')
    expect(formatLocalizedShoppingQuantity(null, 'pack')).toBe('balení')
    await changeLanguage('en')
    expect(formatLocalizedShoppingQuantity(1.5, null)).toBe('1.5')
    await changeLanguage('cs')
  })
})

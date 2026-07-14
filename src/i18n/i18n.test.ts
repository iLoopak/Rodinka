import { afterEach, describe, expect, it } from 'vitest'
import { changeLanguage, getCurrentLanguage } from './index'
import { applyLanguage, LANGUAGE_STORAGE_KEY, languageFromLocale, resolveInitialLanguage } from './language'
import { strings, t } from '../strings'
import { formatFullDate } from '../utils/dueDate'
import { formatLocalizedCurrency, formatLocalizedNumber } from './format'

afterEach(async () => { await changeLanguage('cs') })

describe('language selection', () => {
  it('recognizes Czech locales and falls back to English', () => {
    expect(languageFromLocale('cs')).toBe('cs')
    expect(languageFromLocale('cs-CZ')).toBe('cs')
    expect(languageFromLocale('cs_SK')).toBe('cs')
    expect(languageFromLocale('de-DE')).toBe('en')
  })

  it('prefers and preserves a stored supported language', () => {
    expect(resolveInitialLanguage('cs', ['en-US'])).toBe('cs')
    expect(resolveInitialLanguage(null, ['en-GB'])).toBe('en')
    const values = new Map<string, string>()
    const documentElement = { lang: '' }
    applyLanguage('cs', { documentElement, storage: { setItem: (key, value) => { values.set(key, value) } } })
    expect(values.get(LANGUAGE_STORAGE_KEY)).toBe('cs')
    expect(documentElement.lang).toBe('cs')
    expect(resolveInitialLanguage(values.get(LANGUAGE_STORAGE_KEY), ['en-US'])).toBe('cs')
  })
})

describe('reactive translations', () => {
  it('changes Czech and English labels without a reload', async () => {
    await changeLanguage('cs')
    expect(getCurrentLanguage()).toBe('cs')
    expect(t.nav.calendar).toBe('Kalendář')
    await changeLanguage('en')
    expect(getCurrentLanguage()).toBe('en')
    expect(t.nav.calendar).toBe('Calendar')
  })

  it('updates dynamic labels and plural forms', async () => {
    await changeLanguage('cs')
    expect(t.shopping.activeCount(2)).toBe('2 položky k nákupu')
    await changeLanguage('en')
    expect(t.shopping.activeCount(1)).toBe('1 item to buy')
    expect(t.shopping.activeCount(2)).toBe('2 items to buy')
  })

  it('formats dates for the active locale', async () => {
    await changeLanguage('cs')
    expect(formatFullDate('2026-07-14')).toContain('července')
    await changeLanguage('en')
    expect(formatFullDate('2026-07-14')).toContain('July')
  })

  it('formats numbers and the configured currency by locale', () => {
    expect(formatLocalizedNumber(1.5, 'cs')).toBe('1,5')
    expect(formatLocalizedNumber(1.5, 'en')).toBe('1.5')
    expect(formatLocalizedCurrency(1250, 'cs')).toContain('Kč')
    expect(formatLocalizedCurrency(1250, 'en')).toContain('CZK')
  })
})

function objectShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(objectShape)
  if (typeof value === 'function') return 'function'
  if (!value || typeof value !== 'object') return typeof value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, objectShape(nested)]))
}

it('keeps the Czech and English catalogs structurally complete', () => {
  expect(objectShape(strings.en)).toEqual(objectShape(strings.cs))
})

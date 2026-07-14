import type { Language } from './language'
import { localeFor } from './language'

export function formatLocalizedNumber(value: number, language: Language, maximumFractionDigits = 3) {
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits }).format(value)
}

export function formatLocalizedCurrency(value: number, language: Language, currency = 'CZK') {
  return new Intl.NumberFormat(localeFor(language), { style: 'currency', currency }).format(value)
}

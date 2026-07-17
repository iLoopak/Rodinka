import { afterEach, describe, expect, it } from 'vitest'
import { allowanceAnchorLabel, allowanceFrequencyLabel, allowancePlanSummary } from './allowanceSummary'
import { formatLocalizedCurrency } from '../i18n/format'
import { changeLanguage } from '../i18n'

const monthly = { amount: 200, frequency: 'monthly' as const, payout_day: 1, payout_weekday: null }
const weekly = { amount: 50, frequency: 'weekly' as const, payout_day: null, payout_weekday: 7 }

afterEach(async () => { await changeLanguage('cs') })

describe('allowance plan summary', () => {
  // The amount comes from Intl, which separates it from the currency with a
  // non-breaking space, so the expected text is composed rather than typed out.
  it('summarises a monthly plan in Czech', async () => {
    await changeLanguage('cs')
    expect(allowancePlanSummary(monthly))
      .toBe(`${formatLocalizedCurrency(200, 'cs')} měsíčně · každý 1. den v měsíci`)
  })

  it('summarises a weekly plan in Czech with the weekday inflected', async () => {
    await changeLanguage('cs')
    expect(allowancePlanSummary(weekly)).toBe(`${formatLocalizedCurrency(50, 'cs')} týdně · každou neděli`)
    expect(allowanceAnchorLabel({ ...weekly, payout_weekday: 3 })).toBe('každou středu')
    expect(allowanceAnchorLabel({ ...weekly, payout_weekday: 1 })).toBe('každé pondělí')
  })

  it('summarises both frequencies in English', async () => {
    await changeLanguage('en')
    expect(allowancePlanSummary(monthly))
      .toBe(`${formatLocalizedCurrency(200, 'en')} monthly · day 1 of every month`)
    expect(allowancePlanSummary(weekly)).toBe(`${formatLocalizedCurrency(50, 'en')} weekly · every Sunday`)
    expect(allowanceFrequencyLabel('weekly')).toBe('weekly')
  })

  it('falls back to the amount alone when the anchor is missing', async () => {
    await changeLanguage('cs')
    expect(allowancePlanSummary({ ...weekly, payout_weekday: null }))
      .toBe(`${formatLocalizedCurrency(50, 'cs')} týdně`)
  })
})

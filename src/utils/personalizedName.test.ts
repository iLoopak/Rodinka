import { describe, expect, it } from 'vitest'
import { getCzechVocativeName, getLocalizedAddressName, normalizePersonalName } from './personalizedName'

describe('getCzechVocativeName', () => {
  it.each([
    ['Lukáš', 'Lukáši'],
    ['Petr', 'Petře'],
    ['Viktor', 'Viktore'],
    ['Richard', 'Richarde'],
    ['Tereza', 'Terezo'],
    ['Iveta', 'Iveto'],
  ])('addresses %s as %s', (name, expected) => {
    expect(getCzechVocativeName({ firstName: name })).toBe(expected)
  })

  it('normalizes whitespace and keeps manual overrides first', () => {
    expect(normalizePersonalName('  Jan   Pavel  ')).toBe('Jan Pavel')
    expect(getCzechVocativeName({ firstName: 'Nicolas', manualVocative: '  Nicolasi  ' })).toBe('Nicolasi')
    expect(getCzechVocativeName({ firstName: ' Lukáš ', manualVocative: '   ' })).toBe('Lukáši')
  })

  it('preserves the complete multi-part name and only inflects its first part', () => {
    expect(getCzechVocativeName({ firstName: 'Jan Pavel' })).toBe('Jane Pavel')
    expect(getCzechVocativeName({ firstName: 'Anna-Marie' })).toBe('Anno-Marie')
  })

  it('falls back safely for empty values, email addresses, unsupported input, and converter failures', () => {
    expect(getCzechVocativeName({ firstName: '' })).toBe('')
    expect(getCzechVocativeName({ firstName: 'lukas@example.com' })).toBe('lukas@example.com')
    expect(getCzechVocativeName({ firstName: 'X Æ A-12' })).toBe('X Æ A-12')
    expect(getCzechVocativeName({ firstName: 'Lukáš' }, () => { throw new Error('failure') })).toBe('Lukáš')
  })

  it('does not turn an initially capitalized name into lowercase', () => {
    expect(getCzechVocativeName({ firstName: 'Lukáš' }, () => 'lukáši')).toBe('Lukáši')
  })
})

describe('getLocalizedAddressName', () => {
  it('keeps the original normalized name outside Czech, including a Czech manual override', () => {
    expect(getLocalizedAddressName({ firstName: ' Lukáš ', manualVocative: 'Lukáši', locale: 'en' })).toBe('Lukáš')
  })
})

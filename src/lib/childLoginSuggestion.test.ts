import { describe, expect, it } from 'vitest'
import { isValidChildLoginName } from './childAccountIdentity'
import { suggestChildLoginName } from './childLoginSuggestion'

describe('suggestChildLoginName', () => {
  it('strips Czech diacritics into a typable name', () => {
    expect(suggestChildLoginName('Řehoř')).toBe('rehor')
    expect(suggestChildLoginName('Anežka')).toBe('anezka')
  })

  it('joins multi-word names with a dash', () => {
    expect(suggestChildLoginName('Jan Novák')).toBe('jan-novak')
  })

  it('always proposes a server-valid name', () => {
    for (const name of ['Řehoř', 'Jan Novák', 'A', 'Ab', '李雷', '   ', '...']) {
      const suggestion = suggestChildLoginName(name)
      expect(suggestion === '' || isValidChildLoginName(suggestion)).toBe(true)
    }
  })

  it('pads names that are too short to be valid on their own', () => {
    const suggestion = suggestChildLoginName('Bo')
    expect(isValidChildLoginName(suggestion)).toBe(true)
    expect(suggestion.startsWith('bo')).toBe(true)
  })

  it('produces a usable name when nothing survives normalization', () => {
    const suggestion = suggestChildLoginName('李雷')
    expect(isValidChildLoginName(suggestion)).toBe(true)
  })
})

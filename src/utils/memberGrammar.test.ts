import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import { memberGrammarVariant } from './memberGrammar'

describe('member-aware wording', () => {
  it('uses masculine, feminine, and neutral completion variants in Czech', () => {
    expect(strings.cs.memberGrammar.completedBy('Richard', 'masculine')).toBe('Splnil: Richard')
    expect(strings.cs.memberGrammar.completedBy('Anna', 'feminine')).toBe('Splnila: Anna')
    expect(strings.cs.memberGrammar.completedBy('Alex', 'neutral')).toBe('Hotovo: Alex')
    expect(strings.cs.memberGrammar.completedBy('Alex', null)).toBe('Hotovo: Alex')
  })

  it('falls back to neutral wording for an unknown runtime value', () => {
    const result = memberGrammarVariant(
      { masculine: 'M', feminine: 'F', neutral: 'N' },
      'unexpected-runtime-value'
    )
    expect(result).toBe('N')
  })

  it('does not emit parenthetical or slash forms for concrete members', () => {
    const results = [
      strings.cs.memberGrammar.completedBy('Richard', 'masculine'),
      strings.cs.memberGrammar.completedBy('Anna', 'feminine'),
      strings.cs.memberGrammar.completedBy('Alex', null),
    ]
    for (const result of results) {
      expect(result).not.toContain('(a)')
      expect(result).not.toContain('/')
    }
  })

  it('keeps English semantic functions gender-independent', () => {
    expect(strings.en.memberGrammar.completedBy('Alex', 'masculine')).toBe('Completed by: Alex')
    expect(strings.en.memberGrammar.completedBy('Alex', 'feminine')).toBe('Completed by: Alex')
  })
})

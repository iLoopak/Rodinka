import { describe, expect, it } from 'vitest'
import {
  MEMBER_COLOR_KEYS,
  MEMBER_COLOR_VAR_BY_KEY,
  memberColorKey,
  memberColorVar,
} from './memberColor'

describe('member colors', () => {
  it('uses a valid saved color instead of the hash fallback', () => {
    expect(memberColorKey({ id: 'same-id', color_key: 'lavender' })).toBe('lavender')
    expect(memberColorVar({ id: 'same-id', color_key: 'lavender' })).toBe('--member-lavender')
  })

  it('keeps the null fallback deterministic', () => {
    const first = memberColorKey({ id: 'member-without-color', color_key: null })
    expect(memberColorKey({ id: 'member-without-color', color_key: null })).toBe(first)
    expect(memberColorKey('member-without-color')).toBe(first)
  })

  it('maps every supported domain key to an existing CSS variable', () => {
    expect(Object.keys(MEMBER_COLOR_VAR_BY_KEY).sort()).toEqual([...MEMBER_COLOR_KEYS].sort())
    for (const key of MEMBER_COLOR_KEYS) expect(MEMBER_COLOR_VAR_BY_KEY[key]).toMatch(/^--/)
  })
})

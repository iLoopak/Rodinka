import { describe, expect, it } from 'vitest'
import {
  chooseLeastUsedMemberColor,
  getMemberColor,
  getMemberMainColor,
  getMemberSoftColor,
  LEGACY_MEMBER_COLOR_MAP,
  MEMBER_COLOR_KEYS,
  MEMBER_COLOR_VAR_BY_KEY,
  MEMBER_COLORS,
  MEMBER_INK,
  getMemberColorTheme,
  normalizeCustomMemberColor,
  memberColorKey,
  memberColorVar,
  normalizeMemberColor,
} from './memberColor'

describe('member colors', () => {

  it('normalizes custom HEX colors and rejects arbitrary CSS', () => {
    expect(normalizeCustomMemberColor('336699')).toBe('#336699')
    expect(normalizeCustomMemberColor('#aabbcc')).toBe('#AABBCC')
    expect(normalizeCustomMemberColor('red')).toBeNull()
    expect(normalizeCustomMemberColor('var(--brand)')).toBeNull()
  })

  it('derives a complete custom color theme with readable foregrounds', () => {
    expect(getMemberColorTheme({ id: 'custom', custom_color: '#111111' })).toMatchObject({
      primary: '#111111',
      foreground: '#FFFFFF',
    })
    expect(getMemberColorTheme({ id: 'custom', custom_color: '#FDFDFD' }).foreground).toBe('#243128')
  })

  it('falls back safely for invalid custom colors', () => {
    expect(getMemberColorTheme({ id: 'same-id', color_key: 'blue', custom_color: 'hotpink' }).primary).toBe(MEMBER_COLORS.blue.main)
  })
  it('defines the canonical Rodinka palette exactly', () => {
    expect(MEMBER_COLOR_KEYS).toEqual(['coral', 'honey', 'mint', 'blue', 'lavender', 'berry', 'peach', 'sage'])
    expect(MEMBER_COLORS).toMatchObject({
      coral: { main: '#E9785E', soft: '#F1C9BC' },
      honey: { main: '#F2C85B', soft: '#F1DDA1' },
      mint: { main: '#8BC6AD', soft: '#B9D8CA' },
      blue: { main: '#8DB9C7', soft: '#9CC7D1' },
      lavender: { main: '#A89BCB', soft: '#D8D2E8' },
      berry: { main: '#CC859F', soft: '#E7C4D1' },
      peach: { main: '#E6A47D', soft: '#F1D0BC' },
      sage: { main: '#9EBA82', soft: '#CDDDBD' },
    })
    expect(MEMBER_INK).toBe('#243128')
  })

  it('has Czech and English labels for every color', () => {
    for (const key of MEMBER_COLOR_KEYS) {
      expect(MEMBER_COLORS[key].label.cs).toBeTruthy()
      expect(MEMBER_COLORS[key].label.en).toBeTruthy()
    }
  })

  it('normalizes every currently persisted legacy key', () => {
    expect(LEGACY_MEMBER_COLOR_MAP).toMatchObject({
      brick: 'lavender', coral: 'coral', sky: 'blue', sage: 'sage', honey: 'honey', lavender: 'lavender', berry: 'berry',
    })
    for (const [legacy, next] of Object.entries(LEGACY_MEMBER_COLOR_MAP)) {
      expect(normalizeMemberColor(legacy)).toBe(next)
    }
  })

  it('safely normalizes missing, malformed and unknown values', () => {
    expect(normalizeMemberColor(null)).toBe('coral')
    expect(normalizeMemberColor({})).toBe('coral')
    expect(normalizeMemberColor('unknown')).toBe('coral')
    expect(normalizeMemberColor(' SKY ')).toBe('blue')
  })

  it('uses a normalized saved color instead of the hash fallback', () => {
    expect(memberColorKey({ id: 'same-id', color_key: 'lavender' })).toBe('lavender')
    expect(memberColorKey({ id: 'same-id', color_key: 'sky' })).toBe('blue')
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

  it('resolves color definitions and main/soft values through one API', () => {
    expect(getMemberColor('brick')).toEqual({ key: 'lavender', ...MEMBER_COLORS.lavender })
    expect(getMemberMainColor('mint')).toBe('#8BC6AD')
    expect(getMemberSoftColor('mint')).toBe('#B9D8CA')
  })

  it('chooses the least-used active family color deterministically', () => {
    expect(chooseLeastUsedMemberColor([{ color_key: 'coral' }, { color_key: 'honey' }, { color_key: 'brick' }])).toBe('mint')
    expect(chooseLeastUsedMemberColor([{ color_key: 'coral' }, { color_key: 'coral' }, { color_key: 'honey', status: 'removed' }])).toBe('honey')
  })
})

import type { CSSProperties } from 'react'
import type { FamilyMember, MemberColorKey } from '../hooks/useFamilyMembers'

export const MEMBER_INK = '#243128'

export const MEMBER_COLORS = {
  coral: { main: '#E9785E', soft: '#F1C9BC', label: { cs: 'Korálová', en: 'Coral' } },
  honey: { main: '#F2C85B', soft: '#F1DDA1', label: { cs: 'Medová', en: 'Honey' } },
  mint: { main: '#8BC6AD', soft: '#B9D8CA', label: { cs: 'Mátová', en: 'Mint' } },
  blue: { main: '#8DB9C7', soft: '#9CC7D1', label: { cs: 'Modrá', en: 'Blue' } },
  lavender: { main: '#A89BCB', soft: '#D8D2E8', label: { cs: 'Levandulová', en: 'Lavender' } },
  berry: { main: '#CC859F', soft: '#E7C4D1', label: { cs: 'Růžová', en: 'Berry' } },
  peach: { main: '#E6A47D', soft: '#F1D0BC', label: { cs: 'Broskvová', en: 'Peach' } },
  sage: { main: '#9EBA82', soft: '#CDDDBD', label: { cs: 'Šalvějová', en: 'Sage' } },
} as const satisfies Record<MemberColorKey, Omit<MemberColorDefinition, 'key'>>

export type MemberColorDefinition = {
  key: MemberColorKey
  main: string
  soft: string
  label: { cs: string; en: string }
}

export const MEMBER_COLOR_KEYS = Object.keys(MEMBER_COLORS) as MemberColorKey[]
export const LEGACY_MEMBER_COLOR_KEYS = ['brick', 'sky'] as const
export type LegacyMemberColorKey = (typeof LEGACY_MEMBER_COLOR_KEYS)[number]

export const LEGACY_MEMBER_COLOR_MAP: Record<string, MemberColorKey> = {
  brick: 'lavender',
  coral: 'coral',
  sky: 'blue',
  sage: 'sage',
  honey: 'honey',
  lavender: 'lavender',
  berry: 'berry',
  mint: 'mint',
  blue: 'blue',
  peach: 'peach',
}

export const MEMBER_COLOR_VAR_BY_KEY: Record<MemberColorKey, string> = Object.fromEntries(
  MEMBER_COLOR_KEYS.map((key) => [key, `--member-${key}`])
) as Record<MemberColorKey, string>
export const MEMBER_SOFT_COLOR_VAR_BY_KEY: Record<MemberColorKey, string> = Object.fromEntries(
  MEMBER_COLOR_KEYS.map((key) => [key, `--member-${key}-soft`])
) as Record<MemberColorKey, string>

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0
  return Math.abs(hash)
}

export function isMemberColorKey(value: unknown): value is MemberColorKey {
  return typeof value === 'string' && value in MEMBER_COLORS
}

export function normalizeMemberColor(value: unknown): MemberColorKey {
  if (typeof value !== 'string') return 'coral'
  const normalized = value.trim().toLowerCase()
  return LEGACY_MEMBER_COLOR_MAP[normalized] ?? 'coral'
}

export function memberColorKey(member: { id: string; color_key?: unknown } | string): MemberColorKey {
  const memberId = typeof member === 'string' ? member : member.id
  const savedColor = typeof member === 'string' ? null : member.color_key
  if (savedColor != null && String(savedColor).trim() !== '') return normalizeMemberColor(savedColor)
  return MEMBER_COLOR_KEYS[hashString(memberId) % MEMBER_COLOR_KEYS.length]
}

export function getMemberColor(value: unknown): MemberColorDefinition {
  const key = normalizeMemberColor(value)
  return { key, ...MEMBER_COLORS[key] }
}

export function getMemberMainColor(value: unknown): string {
  return getMemberColor(value).main
}

export function getMemberSoftColor(value: unknown): string {
  return getMemberColor(value).soft
}

export function memberColorVar(member: { id: string; color_key?: unknown } | string): string {
  return MEMBER_COLOR_VAR_BY_KEY[memberColorKey(member)]
}

export function memberSoftColorVar(member: { id: string; color_key?: unknown } | string): string {
  return MEMBER_SOFT_COLOR_VAR_BY_KEY[memberColorKey(member)]
}

export function memberColorStyle(member: Pick<FamilyMember, 'id' | 'color_key'> | string) {
  const key = memberColorKey(member)
  return {
    '--member-color-main': MEMBER_COLORS[key].main,
    '--member-color-soft': MEMBER_COLORS[key].soft,
    '--member-color-ink': MEMBER_INK,
  } as CSSProperties
}

export function chooseLeastUsedMemberColor(members: Array<{ color_key?: unknown; status?: string | null }>): MemberColorKey {
  const counts = Object.fromEntries(MEMBER_COLOR_KEYS.map((key) => [key, 0])) as Record<MemberColorKey, number>
  for (const member of members) {
    if (member.status && member.status !== 'active') continue
    counts[memberColorKey({ id: '', color_key: member.color_key })] += 1
  }
  return MEMBER_COLOR_KEYS.reduce((best, key) => counts[key] < counts[best] ? key : best, MEMBER_COLOR_KEYS[0])
}

export function memberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

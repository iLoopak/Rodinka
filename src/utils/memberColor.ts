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

export interface MemberColorTheme {
  primary: string
  soft: string
  foreground: string
  border: string
  hover: string
}

export type MemberColorSource = { id: string; color_key?: unknown; custom_color?: unknown }

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

const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6})$/

export function normalizeCustomMemberColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(HEX_COLOR_RE)
  return match ? `#${match[1].toUpperCase()}` : null
}

function hexToRgb(hex: string) {
  const normalized = normalizeCustomMemberColor(hex) ?? MEMBER_COLORS.coral.main
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

function mixHex(left: string, right: string, weight: number): string {
  const a = hexToRgb(left)
  const b = hexToRgb(right)
  return rgbToHex({
    r: a.r * (1 - weight) + b.r * weight,
    g: a.g * (1 - weight) + b.g * weight,
    b: a.b * (1 - weight) + b.b * weight,
  })
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (value: number) => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function getMemberColorTheme(member: MemberColorSource | string | null | undefined): MemberColorTheme {
  const customColor = typeof member === 'object' && member ? normalizeCustomMemberColor(member.custom_color) : null
  if (!customColor) {
    const color = getMemberColor(typeof member === 'string' || !member ? member : member.color_key)
    return {
      primary: color.main,
      soft: color.soft,
      foreground: MEMBER_INK,
      border: color.main,
      hover: mixHex(color.main, '#000000', 0.08),
    }
  }
  const luminance = relativeLuminance(customColor)
  const foreground = luminance > 0.46 ? '#243128' : '#FFFFFF'
  return {
    primary: customColor,
    soft: mixHex(customColor, luminance > 0.72 ? '#F2EDE4' : '#FFFFFF', 0.78),
    foreground,
    border: luminance > 0.82 ? mixHex(customColor, '#243128', 0.36) : customColor,
    hover: mixHex(customColor, luminance > 0.5 ? '#000000' : '#FFFFFF', 0.12),
  }
}

export function memberColorVar(member: { id: string; color_key?: unknown } | string): string {
  return MEMBER_COLOR_VAR_BY_KEY[memberColorKey(member)]
}

export function memberSoftColorVar(member: { id: string; color_key?: unknown } | string): string {
  return MEMBER_SOFT_COLOR_VAR_BY_KEY[memberColorKey(member)]
}

export function memberColorStyle(member: Pick<FamilyMember, 'id' | 'color_key' | 'custom_color'> | string) {
  const theme = getMemberColorTheme(typeof member === 'string' ? { id: member } : member)
  return {
    '--member-primary': theme.primary,
    '--member-soft': theme.soft,
    '--member-foreground': theme.foreground,
    '--member-border': theme.border,
    '--member-hover': theme.hover,
    '--member-color-main': theme.primary,
    '--member-color-soft': theme.soft,
    '--member-color-ink': theme.foreground,
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

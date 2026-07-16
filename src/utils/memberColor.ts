import type { MemberColorKey } from '../hooks/useFamilyMembers'

export const MEMBER_COLOR_KEYS = [
  'brick',
  'coral',
  'sky',
  'sage',
  'honey',
  'lavender',
  'berry',
] as const satisfies readonly MemberColorKey[]

export const MEMBER_COLOR_VAR_BY_KEY: Record<MemberColorKey, string> = {
  brick: '--member-brick',
  coral: '--member-coral',
  sky: '--member-sky',
  sage: '--member-sage',
  honey: '--member-honey',
  lavender: '--member-lavender',
  berry: '--member-berry',
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function isMemberColorKey(value: unknown): value is MemberColorKey {
  return typeof value === 'string' && MEMBER_COLOR_KEYS.includes(value as MemberColorKey)
}

export function memberColorKey(member: { id: string; color_key?: unknown } | string): MemberColorKey {
  const memberId = typeof member === 'string' ? member : member.id
  const savedColor = typeof member === 'string' ? null : member.color_key
  if (isMemberColorKey(savedColor)) return savedColor
  return MEMBER_COLOR_KEYS[hashString(memberId) % MEMBER_COLOR_KEYS.length]
}

export function memberColorVar(member: { id: string; color_key?: unknown } | string): string {
  return MEMBER_COLOR_VAR_BY_KEY[memberColorKey(member)]
}

// The brand mark speaks the landing page's four-hue language, not the member
// identity palette — those greens and purples are tuned for contrast on
// avatars and would make the logo unrecognisable next to the landing page.
// A member's stored colour still picks their shape's hue deterministically,
// so the mapping adds no new colours; it only reuses existing brand tokens.
export const MARK_COLOR_VAR_BY_KEY: Record<MemberColorKey, string> = {
  brick: '--brand-coral-dark',
  coral: '--brand-coral',
  sky: '--brand-blue',
  sage: '--brand-mint',
  honey: '--brand-honey',
  lavender: '--brand-blue',
  berry: '--brand-coral-dark',
}

export function markColorVar(member: { id: string; color_key?: unknown } | string): string {
  return MARK_COLOR_VAR_BY_KEY[memberColorKey(member)]
}

export function memberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

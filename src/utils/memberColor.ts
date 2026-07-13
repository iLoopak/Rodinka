// Deterministic per-member color, built entirely from the app's existing
// accent palette (index.css :root) rather than introducing a new color
// system. Same member id always maps to the same swatch.
const MEMBER_COLOR_VARS = [
  '--brick',
  '--coral',
  '--accent-sky',
  '--accent-sage',
  '--accent-honey',
  '--accent-lavender',
  '--accent-berry',
]

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function memberColorVar(memberId: string): string {
  const index = hashString(memberId) % MEMBER_COLOR_VARS.length
  return MEMBER_COLOR_VARS[index]
}

export function memberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

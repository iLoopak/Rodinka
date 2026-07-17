import {
  CHILD_LOGIN_MAX_LENGTH,
  CHILD_LOGIN_MIN_LENGTH,
  isValidChildLoginName,
  normalizeChildLoginName,
} from './childAccountIdentity'

// Uniqueness is the server's call — login names are globally unique across
// every household, so the client cannot know what is free. This only proposes
// a locally valid starting point the parent can edit.
export function suggestChildLoginName(displayName: string): string {
  const base = normalizeChildLoginName(displayName).slice(0, CHILD_LOGIN_MAX_LENGTH)
  if (isValidChildLoginName(base)) return base
  // Names that normalize to nothing usable (initials, non-Latin scripts, a
  // single letter) still need a typable suggestion.
  const padded = `${base}${base ? '-' : 'dite-'}${Math.floor(Date.now() / 1000) % 1000}`
    .slice(0, CHILD_LOGIN_MAX_LENGTH)
  const normalized = normalizeChildLoginName(padded)
  return normalized.length >= CHILD_LOGIN_MIN_LENGTH ? normalized : ''
}

export const CHILD_LOGIN_DOMAIN = 'children.rodinka.invalid'
export const CHILD_LOGIN_MIN_LENGTH = 3
export const CHILD_LOGIN_MAX_LENGTH = 32

export function normalizeChildLoginName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
}

export function isValidChildLoginName(value: string): boolean {
  const normalized = normalizeChildLoginName(value)
  return normalized === value
    && normalized.length >= CHILD_LOGIN_MIN_LENGTH
    && normalized.length <= CHILD_LOGIN_MAX_LENGTH
    && /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(normalized)
}

export function childLoginNameToInternalEmail(value: string): string {
  const normalized = normalizeChildLoginName(value)
  if (!isValidChildLoginName(normalized)) throw new Error('Invalid child login name')
  return `child.${normalized}@${CHILD_LOGIN_DOMAIN}`
}

export function internalEmailToChildLoginName(value: string | null | undefined): string | null {
  if (!value) return null
  const suffix = `@${CHILD_LOGIN_DOMAIN}`
  if (!value.startsWith('child.') || !value.endsWith(suffix)) return null
  const loginName = value.slice('child.'.length, -suffix.length)
  return isValidChildLoginName(loginName) ? loginName : null
}

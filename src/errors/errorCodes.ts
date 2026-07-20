/**
 * One closed vocabulary for everything that can go wrong between the app and
 * the backend. UI reads these codes; it never reads a raw Supabase message.
 *
 * The distinction that matters most is at the top of `classifyAppError`:
 * `permission-denied` and `auth-expired` are NOT connectivity failures. They
 * must never be mistaken for `network-offline`, because the offline paths are
 * the ones allowed to fall back to cached family data — and a user who lost
 * access to a family must not be handed that family's cache.
 */
export type AppErrorCode =
  | 'network-offline'
  | 'backend-unavailable'
  | 'request-timeout'
  | 'auth-expired'
  | 'permission-denied'
  | 'not-found'
  | 'conflict'
  | 'storage-quota'
  | 'cache-corrupt'
  | 'mutation-failed'
  | 'realtime-disconnected'
  | 'unknown'

const RETRYABLE: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  'network-offline',
  'backend-unavailable',
  'request-timeout',
  'realtime-disconnected',
  'unknown',
])

export function isRetryableErrorCode(code: AppErrorCode) {
  return RETRYABLE.has(code)
}

/** True for the codes that may never unlock cached, family-scoped data. */
export function deniesCachedData(code: AppErrorCode) {
  return code === 'permission-denied' || code === 'auth-expired' || code === 'not-found'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error ?? '')
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return ''
}

export function classifyStorageError(error: unknown): AppErrorCode {
  const name = error instanceof Error ? error.name : ''
  if (name === 'QuotaExceededError' || /quota/i.test(errorMessage(error))) return 'storage-quota'
  if (name === 'DataError' || name === 'NotFoundError') return 'cache-corrupt'
  return 'unknown'
}

export function classifyAppError(error: unknown, options: { browserOnline?: boolean } = {}): AppErrorCode {
  const message = errorMessage(error)
  const code = errorCode(error)

  // Authorization first, and independent of connectivity. A 403 while the
  // radio happens to be off is still a 403.
  if (code === '42501' || /\brow[- ]level security\b|\bforbidden\b|\bpermission denied\b|\b403\b/i.test(message)) return 'permission-denied'
  if (/\bjwt\b|\b401\b|invalid (refresh )?token|session (expired|missing)|unauthori[sz]ed/i.test(message)) return 'auth-expired'

  if (code === 'PGRST116' || /\b404\b|\bnot found\b/i.test(message)) return 'not-found'
  if (code === '23505' || code === '23503' || /\b409\b|duplicate key|conflict/i.test(message)) return 'conflict'
  if (code.startsWith('22') || code === 'P0001') return 'mutation-failed'

  if (error instanceof DOMException && error.name === 'AbortError') return 'request-timeout'
  if (/timed? ?out|timeout|\b504\b/i.test(message)) return 'request-timeout'

  const looksLikeTransport = /failed to fetch|networkerror|network request failed|load failed|internet disconnected|err_internet_disconnected|err_network_changed|err_name_not_resolved|err_connection|network unavailable/i.test(message)
  if (looksLikeTransport) {
    // The browser being offline is the only thing that proves `network-offline`.
    // An identical transport failure with the radio up means the backend is
    // unreachable — degraded, not offline (acceptance criteria).
    return options.browserOnline === false ? 'network-offline' : 'backend-unavailable'
  }
  if (/\b5\d\d\b|service unavailable|bad gateway/i.test(message)) return 'backend-unavailable'
  if (options.browserOnline === false) return 'network-offline'

  const storage = classifyStorageError(error)
  if (storage !== 'unknown') return storage

  return 'unknown'
}

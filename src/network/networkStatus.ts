export type NetworkStatus = 'checking' | 'online' | 'offline'

export function getBrowserNetworkStatus(): NetworkStatus {
  if (typeof navigator === 'undefined') return 'online'
  return navigator.onLine === false ? 'offline' : 'online'
}

// Supabase hands back two different error shapes: AuthError (a real Error
// subclass) and PostgrestError (a plain object with a `message` field). Reading
// only `instanceof Error` stringified the latter to "[object Object]", so every
// message rule below silently never matched for database errors and the offline
// fallback depended entirely on navigator.onLine.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error ?? '')
}

export function isNetworkUnavailableError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error instanceof DOMException && error.name === 'AbortError') return false
  const message = errorMessage(error)
  if (/\b(400|401|403)\b/.test(message)) return false
  if (/unauthori[sz]ed|forbidden|jwt|session|rls|row level security|bad request|permission/i.test(message)) return false
  return /failed to fetch|networkerror|network request failed|load failed|internet disconnected|err_internet_disconnected|err_network_changed|err_name_not_resolved|err_connection|network unavailable/i.test(message)
}

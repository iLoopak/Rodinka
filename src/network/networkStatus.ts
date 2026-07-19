export type NetworkStatus = 'checking' | 'online' | 'offline'

export function getBrowserNetworkStatus(): NetworkStatus {
  if (typeof navigator === 'undefined') return 'online'
  return navigator.onLine === false ? 'offline' : 'online'
}

export function isNetworkUnavailableError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error instanceof DOMException && error.name === 'AbortError') return false
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/\b(400|401|403)\b/.test(message)) return false
  if (/unauthori[sz]ed|forbidden|jwt|session|rls|row level security|bad request|permission/i.test(message)) return false
  return /failed to fetch|networkerror|network request failed|load failed|internet disconnected|err_internet_disconnected|err_network_changed|err_name_not_resolved|err_connection|network unavailable/i.test(message)
}

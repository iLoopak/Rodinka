/**
 * Development-only tracing for the offline/cache/sync layers.
 *
 * Hard rule for everything in this file: it logs *shapes and counts*, never
 * content. No record bodies, member names, message text, medical data, tokens,
 * signed URLs, or ids that identify a person. A count of pending mutations is
 * fine; the mutation payload is not. These lines land in real users' consoles
 * and get pasted into bug reports.
 */

const devEnabled = () => typeof import.meta !== 'undefined' && import.meta.env?.DEV

type Scalar = string | number | boolean | null

function safe(details: Record<string, Scalar>) {
  return details
}

function emit(channel: string, event: string, details: Record<string, Scalar>) {
  if (!devEnabled()) return
  console.info(`[Rodinka ${channel}] ${event}`, safe(details))
}

export function logConnectivity(state: string, details: { browserOnline: boolean; realtimeState: string; backendReachable: boolean | null }) {
  emit('connectivity', state, {
    browserOnline: details.browserOnline,
    realtimeState: details.realtimeState,
    backendReachable: details.backendReachable,
  })
}

export function logFeatureSync(feature: string, event: 'start' | 'end' | 'error', details: { pendingCount: number; errorCode?: string | null }) {
  emit('feature-sync', `${feature}:${event}`, {
    pendingCount: details.pendingCount,
    errorCode: details.errorCode ?? null,
  })
}

export function logAccountCleanup(event: 'start' | 'end', details: Record<string, Scalar>) {
  emit('account-cleanup', event, details)
}

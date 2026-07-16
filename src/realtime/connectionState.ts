import type { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'

// One shared vocabulary every feature provider's realtime status is
// expressed in, regardless of how many tables/channels it owns.
export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

// Maps a Supabase channel subscribe status (and the error it may carry) to
// our connection-state vocabulary. Never surfaces raw Supabase status
// strings to consumers, and never treats a drop as "lose local data" —
// callers just update a status field, they never clear their item arrays
// because of this.
export function connectionStateFromSubscribeStatus(
  status: `${REALTIME_SUBSCRIBE_STATES}`,
): RealtimeConnectionState {
  if (status === 'SUBSCRIBED') return 'connected'
  if (status === 'CLOSED') return 'disconnected'
  // CHANNEL_ERROR, TIMED_OUT — the client library retries automatically.
  return 'reconnecting'
}

// A provider composing multiple realtime-backed contexts (e.g. an app-shell
// status indicator) picks the single "worst" state to display.
const SEVERITY: Record<RealtimeConnectionState, number> = {
  connected: 0,
  connecting: 1,
  reconnecting: 2,
  disconnected: 3,
}

export function worstConnectionState(states: RealtimeConnectionState[]): RealtimeConnectionState {
  return states.reduce<RealtimeConnectionState>(
    (worst, state) => (SEVERITY[state] > SEVERITY[worst] ? state : worst),
    'connected',
  )
}

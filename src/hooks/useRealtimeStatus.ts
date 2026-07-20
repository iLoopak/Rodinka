import type { RealtimeConnectionState } from '../realtime/connectionState'
import { useRealtimeOverallStatus } from '../realtime/realtimeStatusStore'

// The shell subscribes to one stable, data-free external snapshot. Feature
// item updates cannot propagate through this hook unless connection state
// itself changes.
export function useRealtimeStatus(): RealtimeConnectionState {
  return useRealtimeOverallStatus()
}

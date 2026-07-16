import { t } from '../../strings'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

interface Props {
  status: RealtimeConnectionState
}

// Subtle by design: nothing renders while connected/connecting (the
// expected state almost all the time) — only a small dot+label appears
// once there's something worth telling the user about, and it clears
// itself the moment the connection recovers. No toast, no dialog.
export function RealtimeStatusBadge({ status }: Props) {
  if (status === 'connected' || status === 'connecting') return null
  const label = status === 'reconnecting' ? t.realtimeStatus.reconnecting : t.realtimeStatus.disconnected

  return (
    <span className={`realtime-status-badge ${status}`} role="status" aria-live="polite">
      <span className="realtime-status-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

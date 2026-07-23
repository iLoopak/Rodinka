import { StatusPill, type StatusTone } from '../../../components/ui/StatusPill'
import type { GameSyncStatus } from '../types'

const TONE_BY_STATUS: Record<Exclude<GameSyncStatus, 'idle'>, StatusTone> = {
  syncing: 'info',
  synced: 'success',
  offline: 'pending',
  error: 'danger',
}

export interface GameOfflineBadgeLabels {
  syncing: string
  synced: string
  offline: string
  error: string
}

// Wraps the app-wide StatusPill so every game's record-sync state reads the
// same way — nothing custom per game, just which label set it's handed.
export function GameOfflineBadge({ status, labels }: { status: GameSyncStatus; labels: GameOfflineBadgeLabels }) {
  if (status === 'idle') return null
  return <StatusPill tone={TONE_BY_STATUS[status]} className="game-offline-badge">{labels[status]}</StatusPill>
}

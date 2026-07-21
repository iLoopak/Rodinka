// Shared across every Family Games entry screen (Family Jump, Family Fleet,
// and any future minigame) so a single sync hook shape works with
// GameOfflineBadge regardless of which game's records it is reporting on.
export type GameSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

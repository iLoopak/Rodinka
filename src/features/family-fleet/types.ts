export type FamilyFleetPhase = 'intro' | 'playing' | 'paused' | 'game-over'
export type FamilyFleetSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'
export interface FamilyFleetRunResult { score: number; survivedMs: number; stars: number; targetsDestroyed: number; highestLevel: number }
export interface FamilyFleetRunStats { runsPlayed: number; totalScore: number; bestScore: number; totalStars: number; totalTargetsDestroyed: number; longestRunMs: number }

import type { CosmeticCategory } from './cosmetics'
import type { FamilyFleetRecordMap } from './storage/records'
import type { FamilyFleetRunResult, FamilyFleetRunStats } from './types'

export type AchievementCategory =
  | 'firstRun' | 'gamesPlayed' | 'survival' | 'score' | 'levels'
  | 'stars' | 'destruction' | 'powerups' | 'familyRecords' | 'meta'

export interface AchievementContext {
  memberId: string
  runResult: FamilyFleetRunResult
  memberStats: FamilyFleetRunStats
  familyStats: Record<string, FamilyFleetRunStats>
  familyRecords: FamilyFleetRecordMap
  /** Achievements already unlocked, including any unlocked earlier in the same evaluation pass. */
  unlockedIds: ReadonlySet<string>
}

export interface AchievementReward { category: CosmeticCategory; id: string }

export interface AchievementDefinition {
  id: string
  category: AchievementCategory
  reward: AchievementReward | null
  condition: (ctx: AchievementContext) => boolean
}

// A member is the family's reigning ace once every other member who has an
// actual recorded score sits below them — with at least one such rival, so
// playing solo can't trivially satisfy it.
function isFamilyChampion(ctx: AchievementContext): boolean {
  const mine = ctx.familyRecords[ctx.memberId] ?? 0
  if (mine <= 0) return false
  const rivals = Object.entries(ctx.familyRecords).filter(([id]) => id !== ctx.memberId).map(([, score]) => score)
  return rivals.length > 0 && rivals.every((score) => score < mine)
}

function membersWhoHavePlayed(ctx: AchievementContext): number {
  return Object.values(ctx.familyStats).filter((stats) => stats.runsPlayed > 0).length
}

// Ordered so meta achievements land last: by the time they're evaluated,
// `unlockedIds` already reflects everything unlocked earlier in this pass.
export const FAMILY_FLEET_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first-flight', category: 'firstRun', reward: null, condition: (ctx) => ctx.memberStats.runsPlayed >= 1 },
  { id: 'launch-arrow', category: 'levels', reward: { category: 'hull', id: 'arrow' }, condition: (ctx) => ctx.runResult.highestLevel >= 5 },
  { id: 'iron-guardian', category: 'survival', reward: { category: 'hull', id: 'guardian' }, condition: (ctx) => ctx.runResult.survivedMs >= 120_000 },
  { id: 'comet-strike', category: 'score', reward: { category: 'hull', id: 'comet' }, condition: (ctx) => ctx.runResult.score >= 5_000 },
  { id: 'five-launches', category: 'gamesPlayed', reward: { category: 'engineTrail', id: 'double' }, condition: (ctx) => ctx.memberStats.runsPlayed >= 5 },
  { id: 'stardust-hoarder', category: 'stars', reward: { category: 'engineTrail', id: 'stardust' }, condition: (ctx) => ctx.memberStats.totalStars >= 100 },
  { id: 'family-fleet-assembled', category: 'familyRecords', reward: { category: 'engineTrail', id: 'familyWave' }, condition: (ctx) => membersWhoHavePlayed(ctx) >= 2 },
  { id: 'high-roller', category: 'score', reward: { category: 'cabin', id: 'gold' }, condition: (ctx) => ctx.memberStats.totalScore >= 20_000 },
  { id: 'night-watch', category: 'survival', reward: { category: 'cabin', id: 'night' }, condition: (ctx) => ctx.memberStats.longestRunMs >= 180_000 },
  { id: 'family-champion', category: 'familyRecords', reward: { category: 'cabin', id: 'familyCrest' }, condition: isFamilyChampion },
  { id: 'demolisher', category: 'destruction', reward: { category: 'wings', id: 'doubleFins' }, condition: (ctx) => ctx.memberStats.totalTargetsDestroyed >= 100 },
  { id: 'power-collector', category: 'powerups', reward: { category: 'wings', id: 'orbitalRings' }, condition: (ctx) => ctx.memberStats.totalPowerupsCollected >= 20 },
  { id: 'top-of-the-fleet', category: 'levels', reward: { category: 'wings', id: 'starPanels' }, condition: (ctx) => ctx.runResult.highestLevel >= 10 },
  { id: 'shatterpoint', category: 'destruction', reward: { category: 'hitEffect', id: 'pixelShatter' }, condition: (ctx) => ctx.runResult.targetsDestroyed >= 20 },
  { id: 'starburst-run', category: 'stars', reward: { category: 'hitEffect', id: 'starBurst' }, condition: (ctx) => ctx.runResult.stars >= 15 },
  { id: 'veteran-pilot', category: 'gamesPlayed', reward: null, condition: (ctx) => ctx.memberStats.runsPlayed >= 25 },
  { id: 'marathon-flight', category: 'survival', reward: null, condition: (ctx) => ctx.memberStats.longestRunMs >= 300_000 },
  { id: 'high-scorer', category: 'score', reward: null, condition: (ctx) => ctx.runResult.score >= 10_000 },
  { id: 'galactic-collector', category: 'stars', reward: null, condition: (ctx) => ctx.memberStats.totalStars >= 250 },
  { id: 'power-master', category: 'powerups', reward: null, condition: (ctx) => ctx.memberStats.totalPowerupsCollected >= 50 },
  { id: 'sky-legend', category: 'meta', reward: { category: 'engineTrail', id: 'rainbow' }, condition: (ctx) => ctx.unlockedIds.size >= 10 },
  { id: 'completionist', category: 'meta', reward: null, condition: (ctx) => ctx.unlockedIds.size >= FAMILY_FLEET_ACHIEVEMENTS.length - 1 },
]

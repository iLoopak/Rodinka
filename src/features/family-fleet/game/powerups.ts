import type { PowerType } from './core'

export interface PowerupDefinition {
  id: PowerType
  /**
   * Seconds the effect lasts once collected. Repair's heal itself is instant —
   * its duration is only a brief HUD confirmation flash, not a gameplay
   * effect. Shield's duration is a safety expiry (it usually ends earlier,
   * consumed the moment it absorbs a hit).
   */
  duration: number
  /** Relative weight used when picking a random power-up to spawn — higher spawns more often. */
  weight: number
  icon: string
  color: string
  /** Base pitch (Hz) for this power-up's distinct pickup chime. */
  tone: number
}

// Adding a future power-up is just one more row here plus a case in
// `applyPowerup` (core.ts) and `drawPowerupIcon` (rendering.ts) — nothing
// else needs to know the full list of types.
export const POWERUPS: readonly PowerupDefinition[] = [
  { id: 'shield', duration: 20, weight: 3, icon: '◌', color: '#8DB9C7', tone: 330 },
  { id: 'twin', duration: 15, weight: 3, icon: 'Ⅱ', color: '#E9785E', tone: 392 },
  { id: 'triple', duration: 10, weight: 1, icon: 'Ⅲ', color: '#C77DEA', tone: 440 },
  { id: 'rapid', duration: 12, weight: 2, icon: '⚡', color: '#FFD166', tone: 587 },
  { id: 'magnet', duration: 15, weight: 3, icon: '✦', color: '#8BC6AD', tone: 349 },
  { id: 'overcharge', duration: 10, weight: 2, icon: '◈', color: '#FF6B6B', tone: 262 },
  { id: 'repair', duration: 1.2, weight: 1.4, icon: '+', color: '#7CFF9C', tone: 523 },
  { id: 'timewarp', duration: 6, weight: 1.2, icon: '◷', color: '#5EC8FF', tone: 294 },
]

const POWERUP_MAP: ReadonlyMap<PowerType, PowerupDefinition> = new Map(POWERUPS.map((p) => [p.id, p]))

export function powerupDefinition(type: PowerType): PowerupDefinition {
  const def = POWERUP_MAP.get(type)
  if (!def) throw new Error(`Unknown power-up type: ${type}`)
  return def
}

const TOTAL_WEIGHT = POWERUPS.reduce((sum, p) => sum + p.weight, 0)

export function pickWeightedPowerup(roll: number): PowerType {
  let acc = 0
  for (const p of POWERUPS) {
    acc += p.weight
    if (roll * TOTAL_WEIGHT < acc) return p.id
  }
  return POWERUPS[POWERUPS.length - 1].id
}

/** Only this many power-up pickups may be alive in space at once. */
export const MAX_POWERUPS_ON_SCREEN = 2

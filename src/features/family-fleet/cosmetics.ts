export type HullId = 'explorer' | 'arrow' | 'guardian' | 'comet'
export type EngineTrailId = 'standard' | 'double' | 'stardust' | 'familyWave' | 'rainbow'
export type CabinId = 'clear' | 'gold' | 'night' | 'familyCrest'
export type WingsId = 'none' | 'doubleFins' | 'orbitalRings' | 'starPanels'
export type HitEffectId = 'standard' | 'pixelShatter' | 'starBurst'
export type CosmeticCategory = 'hull' | 'engineTrail' | 'cabin' | 'wings' | 'hitEffect'
export type CosmeticIdFor<C extends CosmeticCategory> =
  C extends 'hull' ? HullId :
  C extends 'engineTrail' ? EngineTrailId :
  C extends 'cabin' ? CabinId :
  C extends 'wings' ? WingsId :
  HitEffectId

export interface FleetLoadout {
  hull: HullId
  engineTrail: EngineTrailId
  cabin: CabinId
  wings: WingsId
  hitEffect: HitEffectId
}

// The ship's silhouette and hitbox never change with cosmetics — only what
// gets drawn inside it — so every hull/wings variant stays cosmetic-only.
export const DEFAULT_LOADOUT: FleetLoadout = { hull: 'explorer', engineTrail: 'standard', cabin: 'clear', wings: 'none', hitEffect: 'standard' }

export const HULL_IDS: readonly HullId[] = ['explorer', 'arrow', 'guardian', 'comet']
export const ENGINE_TRAIL_IDS: readonly EngineTrailId[] = ['standard', 'double', 'stardust', 'familyWave', 'rainbow']
export const CABIN_IDS: readonly CabinId[] = ['clear', 'gold', 'night', 'familyCrest']
export const WINGS_IDS: readonly WingsId[] = ['none', 'doubleFins', 'orbitalRings', 'starPanels']
export const HIT_EFFECT_IDS: readonly HitEffectId[] = ['standard', 'pixelShatter', 'starBurst']

export const COSMETIC_CATEGORIES: readonly { category: CosmeticCategory; ids: readonly string[] }[] = [
  { category: 'hull', ids: HULL_IDS },
  { category: 'engineTrail', ids: ENGINE_TRAIL_IDS },
  { category: 'cabin', ids: CABIN_IDS },
  { category: 'wings', ids: WINGS_IDS },
  { category: 'hitEffect', ids: HIT_EFFECT_IDS },
]

export function cosmeticKey(category: CosmeticCategory, id: string): string {
  return `${category}:${id}`
}

export function isDefaultCosmetic(category: CosmeticCategory, id: string): boolean {
  return DEFAULT_LOADOUT[category] === id
}

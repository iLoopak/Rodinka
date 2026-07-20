export type FamilyJumpCosmeticSlot = 'head' | 'face' | 'neck' | 'feet'

export interface FamilyJumpCosmeticDefinition {
  key: string
  name: { cs: string; en: string }
  description: { cs: string; en: string }
  slot: FamilyJumpCosmeticSlot
  unlockAtTotalMeters: number
  sortOrder: number
}

export type EquippedCosmetics = Partial<Record<FamilyJumpCosmeticSlot, string>>


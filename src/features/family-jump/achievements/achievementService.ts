import { FAMILY_JUMP_COSMETICS } from '../cosmetics/cosmeticDefinitions'
import type { FamilyJumpCosmeticDefinition } from '../cosmetics/cosmeticTypes'

export function unlockedCosmeticsAt(totalHeightMeters: number): FamilyJumpCosmeticDefinition[] {
  const total = Math.max(0, Math.floor(totalHeightMeters))
  return FAMILY_JUMP_COSMETICS.filter((item) => total >= item.unlockAtTotalMeters)
}

export interface RewardProgress {
  previousMilestone: number
  nextReward: FamilyJumpCosmeticDefinition | null
  remainingMeters: number
  segmentProgress: number
}

export function rewardProgress(totalHeightMeters: number): RewardProgress {
  const total = Math.max(0, Math.floor(totalHeightMeters))
  const nextIndex = FAMILY_JUMP_COSMETICS.findIndex((item) => total < item.unlockAtTotalMeters)
  if (nextIndex < 0) return { previousMilestone: FAMILY_JUMP_COSMETICS.at(-1)?.unlockAtTotalMeters ?? 0, nextReward: null, remainingMeters: 0, segmentProgress: 1 }
  const nextReward = FAMILY_JUMP_COSMETICS[nextIndex]
  const previousMilestone = nextIndex === 0 ? 0 : FAMILY_JUMP_COSMETICS[nextIndex - 1].unlockAtTotalMeters
  const range = nextReward.unlockAtTotalMeters - previousMilestone
  return {
    previousMilestone,
    nextReward,
    remainingMeters: Math.max(0, nextReward.unlockAtTotalMeters - total),
    segmentProgress: Math.max(0, Math.min(1, (total - previousMilestone) / range)),
  }
}

export function formatJumpDistance(meters: number, language: 'cs' | 'en' = 'cs') {
  const value = Math.max(0, Math.floor(meters))
  if (value < 1_000) return `${value} m`
  const kilometers = value / 1_000
  const formatted = Number.isInteger(kilometers)
    ? String(kilometers)
    : kilometers.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { maximumFractionDigits: 1 })
  return `${formatted} km`
}


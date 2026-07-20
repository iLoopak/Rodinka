import { beforeEach, describe, expect, it } from 'vitest'
import { rewardProgress } from '../achievements/achievementService'
import {
  completeFamilyJumpRun,
  equipFamilyJumpCosmetic,
  getMemberJumpProgress,
  loadFamilyJumpProgress,
  unequipFamilyJumpCosmetic,
} from './familyJumpProgressRepository'
import type { StorageLike } from './records'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  clear() { this.values.clear() }
}

const storage = new MemoryStorage()
let family = ''

describe('Family Jump cumulative progress', () => {
  beforeEach(() => { storage.clear(); family = `family-${Math.random()}` })

  it('adds a completed run once and never lowers the cumulative total', () => {
    expect(completeFamilyJumpRun(family, 'anna', 'run-1', 120, storage).progress.totalHeightMeters).toBe(120)
    expect(completeFamilyJumpRun(family, 'anna', 'run-2', -20, storage).progress.totalHeightMeters).toBe(120)
  })

  it('does not count the same run id twice', () => {
    completeFamilyJumpRun(family, 'anna', 'same-run', 7_000, storage)
    const duplicate = completeFamilyJumpRun(family, 'anna', 'same-run', 7_000, storage)
    expect(duplicate.counted).toBe(false)
    expect(duplicate.progress.totalHeightMeters).toBe(7_000)
  })

  it('unlocks a reward exactly at its milestone but not before it', () => {
    expect(completeFamilyJumpRun(family, 'anna', 'before', 9_999, storage).newlyUnlockedKeys).toEqual([])
    expect(completeFamilyJumpRun(family, 'anna', 'exact', 1, storage).newlyUnlockedKeys).toEqual(['round-glasses'])
  })

  it('unlocks multiple crossed milestones in one run', () => {
    expect(completeFamilyJumpRun(family, 'anna', 'big-run', 50_000, storage).newlyUnlockedKeys)
      .toEqual(['round-glasses', 'bow-tie', 'jumper-hat'])
  })

  it('keeps progress separate for stable member ids', () => {
    completeFamilyJumpRun(family, 'anna', 'anna-run', 10_000, storage)
    completeFamilyJumpRun(family, 'bob', 'bob-run', 200, storage)
    const progress = loadFamilyJumpProgress(family, storage)
    expect(progress.anna.totalHeightMeters).toBe(10_000)
    expect(progress.bob.totalHeightMeters).toBe(200)
    expect(progress.bob.unlockedCosmeticKeys).toEqual([])
  })

  it('equips only unlocked cosmetics and replaces one item in the same slot', () => {
    expect(equipFamilyJumpCosmetic(family, 'anna', 'family-crown', storage).equippedCosmetics).toEqual({})
    completeFamilyJumpRun(family, 'anna', 'all', 200_000, storage)
    expect(equipFamilyJumpCosmetic(family, 'anna', 'jumper-hat', storage).equippedCosmetics.head).toBe('jumper-hat')
    expect(equipFamilyJumpCosmetic(family, 'anna', 'family-crown', storage).equippedCosmetics.head).toBe('family-crown')
  })

  it('combines different slots and removes a selected slot', () => {
    completeFamilyJumpRun(family, 'anna', 'all', 200_000, storage)
    equipFamilyJumpCosmetic(family, 'anna', 'round-glasses', storage)
    equipFamilyJumpCosmetic(family, 'anna', 'jumper-hat', storage)
    const combined = getMemberJumpProgress(family, 'anna', storage)
    expect(combined.equippedCosmetics).toEqual({ face: 'round-glasses', head: 'jumper-hat' })
    expect(unequipFamilyJumpCosmetic(family, 'anna', 'head', storage).equippedCosmetics).toEqual({ face: 'round-glasses' })
  })

  it('migrates missing v2 member fields safely without deriving progress from records', () => {
    storage.setItem(`rodinka.family-jump.progress.v2.${family}`, JSON.stringify({ version: 2, familyId: family, gameKey: 'family_jump', members: { anna: { memberId: 'anna' } }, updatedAt: '' }))
    expect(getMemberJumpProgress(family, 'anna', storage)).toMatchObject({ totalHeightMeters: 0, unlockedCosmeticKeys: [], equippedCosmetics: {}, processedRunIds: [] })
    expect(getMemberJumpProgress(family, 'unknown', storage).totalHeightMeters).toBe(0)
  })

  it('calculates the current milestone segment and the completed state', () => {
    expect(rewardProgress(36_000)).toMatchObject({ previousMilestone: 30_000, remainingMeters: 14_000, segmentProgress: 0.3 })
    expect(rewardProgress(200_000)).toMatchObject({ nextReward: null, remainingMeters: 0, segmentProgress: 1 })
  })
})

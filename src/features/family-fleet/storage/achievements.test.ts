import { describe, expect, it } from 'vitest'
import { evaluateFamilyFleetAchievements, loadUnlockedAchievements } from './achievements'
import { isCosmeticUnlocked } from './cosmetics'
import { FAMILY_FLEET_ACHIEVEMENTS } from '../achievements'
import type { FamilyFleetRunResult, FamilyFleetRunStats } from '../types'
function mem(): Storage { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: (k) => { m.delete(k) }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } } }

const emptyStats = (): FamilyFleetRunStats => ({ runsPlayed: 0, totalScore: 0, bestScore: 0, totalStars: 0, totalTargetsDestroyed: 0, longestRunMs: 0, totalPowerupsCollected: 0 })
const emptyResult = (): FamilyFleetRunResult => ({ score: 0, survivedMs: 0, stars: 0, targetsDestroyed: 0, highestLevel: 1, powerupsCollected: 0 })

describe('family fleet achievements evaluation', () => {
  it('unlocks the first-run achievement after one recorded run and never re-fires it', () => {
    const s = mem()
    const memberStats = { ...emptyStats(), runsPlayed: 1 }
    const first = evaluateFamilyFleetAchievements({ familyId: 'f', memberId: 'a', runResult: emptyResult(), memberStats, familyStats: { a: memberStats }, familyRecords: {} }, s)
    expect(first.map((a) => a.id)).toContain('first-flight')
    expect(loadUnlockedAchievements('f', 'a', s).has('first-flight')).toBe(true)
    const second = evaluateFamilyFleetAchievements({ familyId: 'f', memberId: 'a', runResult: emptyResult(), memberStats, familyStats: { a: memberStats }, familyRecords: {} }, s)
    expect(second).toEqual([])
  })

  it('auto-unlocks the reward cosmetic tied to an achievement', () => {
    const s = mem()
    const memberStats = emptyStats()
    const runResult = { ...emptyResult(), highestLevel: 5 }
    const unlocked = evaluateFamilyFleetAchievements({ familyId: 'f', memberId: 'a', runResult, memberStats, familyStats: { a: memberStats }, familyRecords: {} }, s)
    expect(unlocked.map((a) => a.id)).toContain('launch-arrow')
    expect(isCosmeticUnlocked('f', 'a', 'hull', 'arrow', s)).toBe(true)
  })

  it('grants the family-champion achievement only once a rival has a lower score', () => {
    const s = mem()
    const memberStats = emptyStats()
    const solo = evaluateFamilyFleetAchievements({ familyId: 'f', memberId: 'a', runResult: emptyResult(), memberStats, familyStats: { a: memberStats }, familyRecords: { a: 500 } }, s)
    expect(solo.some((a) => a.id === 'family-champion')).toBe(false)
    const withRival = evaluateFamilyFleetAchievements({ familyId: 'f', memberId: 'a', runResult: emptyResult(), memberStats, familyStats: { a: memberStats }, familyRecords: { a: 500, b: 200 } }, s)
    expect(withRival.some((a) => a.id === 'family-champion')).toBe(true)
  })

  it('unlocks every achievement, including both meta ones, when every condition is met in one pass', () => {
    const s = mem()
    const memberStats: FamilyFleetRunStats = {
      runsPlayed: 30, totalScore: 25_000, bestScore: 12_000, totalStars: 260, totalTargetsDestroyed: 260, longestRunMs: 310_000, totalPowerupsCollected: 55,
    }
    const runResult: FamilyFleetRunResult = { score: 12_000, survivedMs: 190_000, stars: 15, targetsDestroyed: 25, highestLevel: 12, powerupsCollected: 10 }
    const rivalStats: FamilyFleetRunStats = { ...emptyStats(), runsPlayed: 1 }
    const unlocked = evaluateFamilyFleetAchievements({
      familyId: 'f', memberId: 'a', runResult, memberStats,
      familyStats: { a: memberStats, b: rivalStats }, familyRecords: { a: 12_000, b: 500 },
    }, s)
    const ids = unlocked.map((a) => a.id)
    expect(ids).toContain('family-fleet-assembled')
    expect(ids).toContain('family-champion')
    expect(ids).toContain('sky-legend')
    expect(ids).toContain('completionist')
    expect(loadUnlockedAchievements('f', 'a', s).size).toBe(FAMILY_FLEET_ACHIEVEMENTS.length)
  })

  it('recovers from corrupt storage', () => {
    const s = mem()
    s.setItem('rodinka.family-fleet.achievements.v1.f', 'not json')
    expect(loadUnlockedAchievements('f', 'a', s)).toEqual(new Set())
  })
})

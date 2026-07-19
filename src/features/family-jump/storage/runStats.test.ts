import { describe, expect, it } from 'vitest'
import { loadFamilyJumpRunStats, recordFamilyJumpRun } from './runStats'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('Family Jump local run statistics', () => {
  it('stores only the latest score, daily best and aggregate attempt count', () => {
    const storage = new MemoryStorage()
    const today = new Date(2026, 6, 19, 12)
    recordFamilyJumpRun('family-stats', 'anna', 120, storage, today)
    const stats = recordFamilyJumpRun('family-stats', 'anna', 80, storage, today)
    expect(stats.anna).toEqual({ lastScore: 80, todayBest: 120, attempts: 2 })
    expect(JSON.stringify(stats)).not.toContain('history')
  })

  it('starts a new daily best without resetting the last score or attempts', () => {
    const storage = new MemoryStorage()
    recordFamilyJumpRun('family-days', 'anna', 180, storage, new Date(2026, 6, 19, 12))
    const nextDay = recordFamilyJumpRun('family-days', 'anna', 45, storage, new Date(2026, 6, 20, 12))
    expect(nextDay.anna).toEqual({ lastScore: 45, todayBest: 45, attempts: 2 })
    expect(loadFamilyJumpRunStats('family-days', storage, new Date(2026, 6, 21, 12)).anna)
      .toEqual({ lastScore: 45, todayBest: 0, attempts: 2 })
  })

  it('keeps statistics scoped to the active family', () => {
    const storage = new MemoryStorage()
    const today = new Date(2026, 6, 19, 12)
    recordFamilyJumpRun('family-one', 'anna', 50, storage, today)
    recordFamilyJumpRun('family-two', 'anna', 90, storage, today)
    expect(loadFamilyJumpRunStats('family-one', storage, today).anna.lastScore).toBe(50)
    expect(loadFamilyJumpRunStats('family-two', storage, today).anna.lastScore).toBe(90)
  })
})

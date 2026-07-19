import { describe, expect, it } from 'vitest'
import type { FamilyMember } from '../../../hooks/useFamilyMembers'
import { loadFamilyJumpRecords, mergeFamilyJumpRecords, saveFamilyJumpBestScore, saveFamilyJumpRecords, sortFamilyJumpLeaderboard, updateBestScore } from './records'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function member(id: string, name: string): FamilyMember {
  return {
    id,
    family_id: 'family-a',
    display_name: name,
    role: 'child',
    user_id: null,
    birth_date: null,
    color_key: 'coral',
    custom_color: null,
    avatar_path: null,
    avatar_url: null,
    grammatical_gender: null,
    vocative_name: null,
    status: 'active',
  }
}

describe('Family Jump records', () => {
  it('only replaces a personal best with a higher integer score', () => {
    const initial = { anna: 120 }
    expect(updateBestScore(initial, 'anna', 90)).toBe(initial)
    expect(updateBestScore(initial, 'anna', 142.9)).toEqual({ anna: 142 })
  })

  it('persists records in a family-scoped versioned document', () => {
    const storage = new MemoryStorage()
    saveFamilyJumpBestScore('family-a', 'anna', 210, storage)
    saveFamilyJumpBestScore('family-b', 'boris', 330, storage)
    expect(loadFamilyJumpRecords('family-a', storage)).toEqual({ anna: 210 })
    expect(loadFamilyJumpRecords('family-b', storage)).toEqual({ boris: 330 })
  })

  it('merges shared records into the local cache without lowering either side', () => {
    expect(mergeFamilyJumpRecords({ anna: 120, boris: 80 }, { anna: 90, boris: 200 })).toEqual({ anna: 120, boris: 200 })
    const storage = new MemoryStorage()
    saveFamilyJumpBestScore('family-merge', 'anna', 120, storage)
    saveFamilyJumpRecords('family-merge', { anna: 90, boris: 240 }, storage)
    expect(loadFamilyJumpRecords('family-merge', storage)).toEqual({ anna: 120, boris: 240 })
  })

  it('sorts the whole family leaderboard by best height', () => {
    const entries = sortFamilyJumpLeaderboard(
      [member('anna', 'Anna'), member('boris', 'Boris'), member('cilka', 'Cilka')],
      { anna: 80, boris: 410 },
    )
    expect(entries.map((entry) => [entry.rank, entry.member.id, entry.score])).toEqual([
      [1, 'boris', 410],
      [2, 'anna', 80],
      [3, 'cilka', 0],
    ])
  })
})

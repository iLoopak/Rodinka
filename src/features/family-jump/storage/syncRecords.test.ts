import { describe, expect, it, vi } from 'vitest'
import type { FamilyJumpRemote } from './familyJumpRemote'
import { recordsFromRows } from './familyJumpRemote'
import { synchronizeFamilyJumpRecords } from './syncRecords'

describe('Family Jump record synchronization', () => {
  it('merges server records and only uploads higher active local records', async () => {
    const remote: FamilyJumpRemote = {
      fetchRecords: vi.fn().mockResolvedValue({ anna: 90, boris: 300 }),
      recordBestScore: vi.fn().mockImplementation(async (_familyId, _memberId, score) => score),
    }

    const merged = await synchronizeFamilyJumpRecords({
      familyId: 'family-a',
      activeMemberIds: ['anna', 'boris'],
      localRecords: { anna: 120, boris: 200, removed: 999 },
      remote,
    })

    expect(remote.recordBestScore).toHaveBeenCalledTimes(1)
    expect(remote.recordBestScore).toHaveBeenCalledWith('family-a', 'anna', 120, undefined)
    expect(merged).toEqual({ anna: 120, boris: 300, removed: 999 })
  })

  it('keeps a higher concurrently returned server score', async () => {
    const remote: FamilyJumpRemote = {
      fetchRecords: vi.fn().mockResolvedValue({}),
      recordBestScore: vi.fn().mockResolvedValue(540),
    }
    await expect(synchronizeFamilyJumpRecords({
      familyId: 'family-a',
      activeMemberIds: ['anna'],
      localRecords: { anna: 500 },
      remote,
    })).resolves.toEqual({ anna: 540 })
  })

  it('normalizes duplicate and malformed remote rows', () => {
    expect(recordsFromRows([
      { member_id: 'anna', best_score: 100 },
      { member_id: 'anna', best_score: 140.9 },
      { member_id: 'boris', best_score: -1 },
    ])).toEqual({ anna: 140 })
  })
})

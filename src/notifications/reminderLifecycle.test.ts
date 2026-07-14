import { describe, expect, it } from 'vitest'
import { makeActivity, makeChore, makeMealPlanEntry, makeMedicalRecord } from '../utils/testFixtures'
import { buildReminderSourceFingerprint, parseReminderInvalidation, shouldRefreshAfterBackground } from './reminderLifecycle'

function snapshot() {
  return {
    members: [], chores: [makeChore()], completions: [], activities: [makeActivity()], medicalRecords: [makeMedicalRecord()],
    voteRounds: [], planEntries: [makeMealPlanEntry()], shoppingItems: [],
  }
}

describe('reminder lifecycle invalidation', () => {
  it('changes fingerprint for responsibility and source lifecycle mutations', () => {
    const before = snapshot()
    const after = { ...before, chores: [{ ...before.chores[0], assigned_to: 'member-2', updated_at: '2026-07-14T12:00:00Z' }] }
    expect(buildReminderSourceFingerprint(after)).not.toBe(buildReminderSourceFingerprint(before))
  })

  it('changes fingerprint for an occurrence-only assignment', () => {
    const before = snapshot()
    const after = { ...before, occurrenceOverrides: [{
      id: 'o1', family_id: 'family-1', series_type: 'activity' as const, series_id: 'a1', occurrence_date: '2026-07-21',
      companion_member_id: 'parent-2', assignee_member_id: null, cancelled: false, updated_at: '2026-07-14T12:00:00Z',
    }] }
    expect(buildReminderSourceFingerprint(after)).not.toBe(buildReminderSourceFingerprint(before))
  })

  it('refreshes only after a meaningful background interval', () => {
    expect(shouldRefreshAfterBackground(1_000, 120_000, 120_000)).toBe(false)
    expect(shouldRefreshAfterBackground(1_000, 121_000, 120_000)).toBe(true)
    expect(shouldRefreshAfterBackground(null, 999_999)).toBe(false)
  })

  it('rejects malformed cross-tab invalidations', () => {
    expect(parseReminderInvalidation('nope')).toBeNull()
    expect(parseReminderInvalidation(JSON.stringify({ kind: 'sources', familyId: 'f' }))).toBeNull()
    expect(parseReminderInvalidation(JSON.stringify({ kind: 'state', familyId: 'f', memberId: 'm', senderId: 'tab', at: 1 }))?.kind).toBe('state')
  })
})

import { describe, expect, it } from 'vitest'
import { parseReminderInvalidation, shouldRefreshAfterBackground } from './reminderLifecycle'

describe('reminder lifecycle invalidation', () => {
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

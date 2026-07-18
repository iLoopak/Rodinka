import { describe, expect, it } from 'vitest'
import { isMuteActive, muteUntil } from './muteDuration'

describe('muteUntil', () => {
  it('returns null for an indefinite mute', () => {
    expect(muteUntil('forever')).toBeNull()
  })

  it('adds exactly one hour', () => {
    const now = new Date('2026-07-18T10:00:00Z')
    expect(Date.parse(muteUntil('hour', now)!) - now.getTime()).toBe(60 * 60 * 1000)
  })

  it('lands on 08:00 local the next day', () => {
    const now = new Date('2026-07-18T20:00:00')
    const until = new Date(muteUntil('tomorrow', now)!)
    expect(until.getHours()).toBe(8)
    expect(until.getDate()).toBe(19)
  })

  it('never returns a past instant when muting in the small hours', () => {
    // 03:00 local: "tomorrow 08:00" must still be ahead of now, and must not
    // silently collapse to this morning.
    const now = new Date('2026-07-18T03:00:00')
    const until = new Date(muteUntil('tomorrow', now)!)
    expect(until.getTime()).toBeGreaterThan(now.getTime())
    expect(until.getDate()).toBe(19)
  })
})

describe('isMuteActive', () => {
  const now = new Date('2026-07-18T10:00:00Z')

  it('is inactive when the scope is none', () => {
    expect(isMuteActive('none', null, now)).toBe(false)
    // Even with a future timestamp still on the row.
    expect(isMuteActive('none', '2026-07-19T10:00:00Z', now)).toBe(false)
  })

  it('is active indefinitely without a timestamp', () => {
    expect(isMuteActive('messages', null, now)).toBe(true)
    expect(isMuteActive('all', null, now)).toBe(true)
  })

  it('is active before the expiry and inactive after it', () => {
    expect(isMuteActive('messages', '2026-07-18T11:00:00Z', now)).toBe(true)
    expect(isMuteActive('messages', '2026-07-18T09:00:00Z', now)).toBe(false)
  })
})

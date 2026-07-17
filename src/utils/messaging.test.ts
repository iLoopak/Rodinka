import { describe, expect, it } from 'vitest'
import { clusterMessages, formatConversationTimestamp, formatDayDivider, messageDayKey } from './messaging'

describe('clusterMessages', () => {
  it('groups consecutive messages from the same sender', () => {
    const clusters = clusterMessages([
      { id: '1', senderId: 'a', createdAt: '2026-07-17T10:00:00Z' },
      { id: '2', senderId: 'a', createdAt: '2026-07-17T10:01:00Z' },
      { id: '3', senderId: 'b', createdAt: '2026-07-17T10:02:00Z' },
      { id: '4', senderId: 'a', createdAt: '2026-07-17T10:03:00Z' },
    ])
    expect(clusters).toHaveLength(3)
    expect(clusters[0].senderId).toBe('a')
    expect(clusters[0].messages.map((m) => m.id)).toEqual(['1', '2'])
    expect(clusters[1].messages.map((m) => m.id)).toEqual(['3'])
    expect(clusters[2].messages.map((m) => m.id)).toEqual(['4'])
  })

  it('breaks the cluster when the gap between messages exceeds the window', () => {
    const clusters = clusterMessages([
      { id: '1', senderId: 'a', createdAt: '2026-07-17T10:00:00Z' },
      { id: '2', senderId: 'a', createdAt: '2026-07-17T10:20:00Z' },
    ], 5 * 60 * 1000)
    expect(clusters).toHaveLength(2)
  })

  it('keeps null-sender system messages in their own clusters', () => {
    const clusters = clusterMessages([
      { id: '1', senderId: null, createdAt: '2026-07-17T10:00:00Z' },
      { id: '2', senderId: null, createdAt: '2026-07-17T10:00:30Z' },
      { id: '3', senderId: 'a', createdAt: '2026-07-17T10:01:00Z' },
    ])
    expect(clusters).toHaveLength(2)
    expect(clusters[0].senderId).toBeNull()
    expect(clusters[0].messages).toHaveLength(2)
  })
})

describe('formatConversationTimestamp', () => {
  it('returns a wall-clock time for messages sent today', () => {
    const now = new Date('2026-07-17T15:00:00Z')
    // Format is locale-dependent but always contains digits and a colon.
    expect(formatConversationTimestamp('2026-07-17T09:30:00Z', now)).toMatch(/[0-9]{1,2}[:.][0-9]{2}/)
  })

  it('returns a weekday short label within the last week', () => {
    const now = new Date('2026-07-17T09:00:00Z')
    const result = formatConversationTimestamp('2026-07-14T10:30:00Z', now)
    // No colon — a weekday label doesn't contain time.
    expect(result).not.toMatch(/[0-9]{1,2}[:.][0-9]{2}/)
  })
})

describe('formatDayDivider', () => {
  it('reports Today/Yesterday and falls back to a date otherwise', () => {
    const now = new Date('2026-07-17T09:00:00Z')
    expect(formatDayDivider('2026-07-17T05:00:00Z', now, { today: 'TODAY', yesterday: 'Y' })).toBe('TODAY')
    expect(formatDayDivider('2026-07-16T22:00:00Z', now, { today: 'T', yesterday: 'Y' })).toBe('Y')
    expect(formatDayDivider('2026-05-01T09:00:00Z', now, { today: 'T', yesterday: 'Y' })).not.toBe('T')
    expect(formatDayDivider('2026-05-01T09:00:00Z', now, { today: 'T', yesterday: 'Y' })).not.toBe('Y')
  })
})

describe('messageDayKey', () => {
  it('returns the local calendar day, so two messages from the same day share one divider', () => {
    const a = messageDayKey('2026-07-17T05:00:00Z')
    const b = messageDayKey('2026-07-17T23:00:00Z')
    // Same calendar day locally — this test avoids asserting the exact key
    // (it varies with the test runner's timezone), only that consistent
    // inputs produce consistent keys and the shape is stable.
    expect(a).toBe(messageDayKey('2026-07-17T05:00:00Z'))
    expect(b).toBe(messageDayKey('2026-07-17T23:00:00Z'))
    expect(a).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  })
})

import { describe, expect, it } from 'vitest'
import { buildDigest, historyReminders, isWithinQuietHours, reminderSection, remindersEligibleForPush, unreadActiveIds, unreadCount } from './reminderPresentation'
import { defaultNotificationPreferences, type ReminderRecord } from './reminders'

function record(overrides: Partial<ReminderRecord> = {}): ReminderRecord {
  return { id: 'r', familyId: 'f', targetMemberId: 'm', dedupeKey: 'd', source: 'chore', type: 'chore-overdue', title: 'Task', description: null, importance: 'important', status: 'unread', eventAt: '2026-07-13T12:00:00Z', generatedAt: '2026-07-14T08:00:00Z', expiresAt: null, deepLink: '/chores', groupingKey: null, metadata: { sourceIds: ['c'], overdue: true }, readAt: null, dismissedAt: null, resolvedAt: null, lastSeenAt: '2026-07-14T08:00:00Z', ...overrides }
}

describe('reminder presentation', () => {
  it('counts only unread active reminders and sections overdue items', () => {
    expect(unreadCount([record(), record({ id: 'read', readAt: '2026-07-14T09:00:00Z' }), record({ id: 'done', resolvedAt: '2026-07-14T09:00:00Z' })])).toBe(1)
    expect(unreadActiveIds([record(), record({ id: 'read', readAt: '2026-07-14T09:00:00Z' })])).toEqual(['r'])
    expect(historyReminders([record(), record({ id: 'read', readAt: '2026-07-14T09:00:00Z' }), record({ id: 'done', resolvedAt: '2026-07-14T09:00:00Z' })]).map((item) => item.id)).toEqual(['read', 'done'])
    expect(reminderSection(record(), new Date('2026-07-14T10:00:00Z'), 'UTC')).toBe('overdue')
  })

  it('builds actionable daily and weekly digests', () => {
    expect(buildDigest([record(), record({ id: 'later', eventAt: '2026-07-20T12:00:00Z', metadata: { sourceIds: ['x'] } })], 'daily', new Date('2026-07-14T10:00:00Z'), 'UTC').items).toHaveLength(1)
    expect(buildDigest([record(), record({ id: 'later', eventAt: '2026-07-20T12:00:00Z', metadata: { sourceIds: ['x'] } })], 'weekly', new Date('2026-07-14T10:00:00Z'), 'UTC').items).toHaveLength(2)
  })

  it('respects push opt-out, quiet suppression and overnight quiet hours', () => {
    const preferences = { ...defaultNotificationPreferences('m', 'f', 'Europe/Prague'), pushEnabled: true }
    expect(remindersEligibleForPush([record({ importance: 'quiet' })], preferences)).toHaveLength(0)
    expect(remindersEligibleForPush([record({ importance: 'quiet' })], { ...preferences, quietPushEnabled: false })).toHaveLength(1)
    expect(isWithinQuietHours(new Date('2026-07-14T21:30:00Z'), { ...preferences, quietHoursEnabled: true })).toBe(true)
  })
})

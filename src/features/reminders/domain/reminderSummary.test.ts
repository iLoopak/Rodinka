import { describe, expect, it } from 'vitest'
import { summaryFromRows } from '../data/reminderRepository'
import { mapReminderSummaryRow } from './reminderMappers'
import { unreadCount } from '../../../notifications/reminderPresentation'
import { reminderStatus, type ReminderRecord } from '../../../notifications/reminders'

function record(overrides: Partial<ReminderRecord>): ReminderRecord {
  const base = {
    id: 'r1', familyId: 'f1', targetMemberId: 'm1', dedupeKey: 'k1',
    source: 'chore' as ReminderRecord['source'], type: 'chore_due', title: 'Vynést koš',
    description: null, importance: 'normal' as ReminderRecord['importance'], eventAt: null,
    generatedAt: '2026-07-20T10:00:00Z', expiresAt: null, deepLink: null, groupingKey: null,
    metadata: { sourceIds: [] } as ReminderRecord['metadata'],
    readAt: null, dismissedAt: null, resolvedAt: null, lastSeenAt: '2026-07-20T10:00:00Z',
    ...overrides,
  }
  return { ...base, status: reminderStatus(base) } as ReminderRecord
}

function toSummaryRow(reminder: ReminderRecord) {
  return mapReminderSummaryRow({
    id: reminder.id,
    importance: reminder.importance,
    read_at: reminder.readAt,
    dismissed_at: reminder.dismissedAt,
    resolved_at: reminder.resolvedAt,
  })
}

describe('bell summary matches the Reminder Center', () => {
  it('counts the same unread reminders as the full list does', () => {
    const reminders = [
      record({ id: 'a' }),
      record({ id: 'b', readAt: '2026-07-20T11:00:00Z' }),
      record({ id: 'c', dismissedAt: '2026-07-20T11:00:00Z' }),
      record({ id: 'd', resolvedAt: '2026-07-20T11:00:00Z' }),
      record({ id: 'e', importance: 'important' }),
    ]

    // The bell reads a narrow projection and the Center reads whole records.
    // If these two ever disagree the badge lies, so they are pinned together.
    const summary = summaryFromRows(reminders.map(toSummaryRow))
    expect(summary.unreadCount).toBe(unreadCount(reminders))
    expect(summary.unreadCount).toBe(2)
  })

  it('flags an important unread reminder', () => {
    expect(summaryFromRows([toSummaryRow(record({ importance: 'important' }))]).hasImportantUnread).toBe(true)
  })

  it('does not flag an important reminder that was already read', () => {
    const read = record({ importance: 'important', readAt: '2026-07-20T11:00:00Z' })
    expect(summaryFromRows([toSummaryRow(read)]).hasImportantUnread).toBe(false)
  })

  it('does not flag an important reminder that was dismissed or resolved', () => {
    const dismissed = record({ importance: 'important', dismissedAt: '2026-07-20T11:00:00Z' })
    const resolved = record({ importance: 'important', resolvedAt: '2026-07-20T11:00:00Z' })
    expect(summaryFromRows([toSummaryRow(dismissed), toSummaryRow(resolved)])).toEqual({
      unreadCount: 0, hasImportantUnread: false,
    })
  })

  it('reports nothing for an empty inbox', () => {
    expect(summaryFromRows([])).toEqual({ unreadCount: 0, hasImportantUnread: false })
  })
})

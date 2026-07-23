import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ReminderRecord } from '../../notifications/reminders'
import { ReminderCard } from './ReminderCenter'

function makeReminder(overrides: Partial<ReminderRecord> = {}): ReminderRecord {
  return {
    id: 'reminder-1',
    familyId: 'family-1',
    targetMemberId: 'member-1',
    dedupeKey: 'dedupe-1',
    source: 'chore',
    type: 'due',
    title: 'Zalít thuje',
    description: null,
    importance: 'normal',
    eventAt: '2026-07-23T00:00:00Z',
    generatedAt: '2026-07-23T00:00:00Z',
    expiresAt: null,
    deepLink: null,
    groupingKey: null,
    metadata: { sourceIds: [] },
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    lastSeenAt: '2026-07-23T00:00:00Z',
    status: 'unread',
    ...overrides,
  }
}

describe('ReminderCard', () => {
  it('renders a known source without crashing', () => {
    const html = renderToStaticMarkup(
      <ReminderCard item={makeReminder()} onOpen={vi.fn()} onRead={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(html).toContain('Zalít thuje')
  })

  // History can hold older records whose `source` predates the current
  // ReminderSource union — the sourceIcons lookup then misses and used to
  // render <undefined />, crashing the whole screen with React error #130
  // the moment a user opened the History tab.
  it('falls back to a generic icon instead of crashing on an unrecognized source', () => {
    const legacyItem = makeReminder({ source: 'legacy-reward' as ReminderRecord['source'] })
    expect(() =>
      renderToStaticMarkup(<ReminderCard item={legacyItem} onOpen={vi.fn()} onRead={vi.fn()} onDismiss={vi.fn()} />)
    ).not.toThrow()
  })
})

// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReminderRecord } from '../notifications/reminders'
import type { ReminderPageQuery, ReminderRepository } from '../features/reminders/data/reminderRepository'

vi.mock('./family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({ familyId: 'f1', currentMember: { id: 'm1' } }),
}))
vi.mock('../i18n/languageContext', () => ({
  useLanguage: () => ({ language: 'cs' }),
}))
vi.mock('./reminders/useReminderSources', () => ({
  useReminderSources: () => ({ loading: false, refresh: async () => undefined, draftInputs: {} }),
}))
vi.mock('../notifications/reminders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../notifications/reminders')>()
  // Drafts are irrelevant here and generating them pulls in eight domains.
  return { ...actual, generateReminderDrafts: () => [] }
})

const { ReminderProvider, useReminders } = await import('./ReminderContext')

function reminder(id: string, generatedAt: string): ReminderRecord {
  const base = {
    id, familyId: 'f1', targetMemberId: 'm1', dedupeKey: `k-${id}`,
    source: 'chore' as ReminderRecord['source'], type: 'chore_due', title: `Reminder ${id}`,
    description: null, importance: 'normal' as ReminderRecord['importance'], eventAt: null,
    generatedAt, expiresAt: null, deepLink: null, groupingKey: null,
    metadata: { sourceIds: [] } as ReminderRecord['metadata'],
    readAt: null, dismissedAt: null, resolvedAt: null, lastSeenAt: generatedAt,
  }
  return { ...base, status: 'unread' } as ReminderRecord
}

function fakeRepository(pages: ReminderRecord[][]) {
  const queries: ReminderPageQuery[] = []
  const repository: ReminderRepository = {
    async getSummary() { return { unreadCount: 0, hasImportantUnread: false } },
    async listPage(query) {
      queries.push(query)
      const index = query.before ? pages.findIndex((page) => page.at(-1)?.generatedAt === query.before) + 1 : 0
      const items = pages[index] ?? []
      const hasMore = index + 1 < pages.length
      return { items, nextCursor: hasMore ? items.at(-1)?.generatedAt ?? null : null }
    },
    async setState() { /* no-op */ },
    async loadPreferences() {
      const { defaultNotificationPreferences, browserTimezone } = await import('../notifications/reminders')
      return defaultNotificationPreferences('m1', 'f1', browserTimezone(), 'cs')
    },
    async ensurePreferences() { /* no-op */ },
    async savePreferences() { /* no-op */ },
    async updateLocale() { /* no-op */ },
  }
  return { repository, queries }
}

let latest: ReturnType<typeof useReminders> | null = null

function Probe() {
  latest = useReminders()
  return null
}

async function mounted(repository: ReminderRepository, children: ReactNode = createElement(Probe)) {
  render(createElement(ReminderProvider, { repository, children }))
  await waitFor(() => expect(latest?.loading).toBe(false))
}

afterEach(() => { cleanup(); latest = null })

describe('reminder pagination', () => {
  it('loads the first page and reports that more exist', async () => {
    const { repository } = fakeRepository([
      [reminder('a', '2026-07-20T12:00:00Z'), reminder('b', '2026-07-20T11:00:00Z')],
      [reminder('c', '2026-07-20T10:00:00Z')],
    ])
    await mounted(repository)

    expect(latest!.reminders.map((item) => item.id)).toEqual(['a', 'b'])
    expect(latest!.hasMore).toBe(true)
  })

  it('appends the next page without duplicating anything', async () => {
    const { repository, queries } = fakeRepository([
      [reminder('a', '2026-07-20T12:00:00Z'), reminder('b', '2026-07-20T11:00:00Z')],
      [reminder('c', '2026-07-20T10:00:00Z')],
    ])
    await mounted(repository)

    await act(async () => { await latest!.loadMore() })

    expect(latest!.reminders.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(latest!.hasMore).toBe(false)
    // Keyset, not offset: the second read is anchored to the last row seen.
    expect(queries[1].before).toBe('2026-07-20T11:00:00Z')
  })

  it('does not duplicate a reminder the sync RPC inserted between pages', async () => {
    // Page two comes back containing a row already on page one, which is what
    // an offset-based reader would do after an insert shifted everything.
    const overlap = reminder('b', '2026-07-20T11:00:00Z')
    const { repository } = fakeRepository([
      [reminder('a', '2026-07-20T12:00:00Z'), overlap],
      [overlap, reminder('c', '2026-07-20T10:00:00Z')],
    ])
    await mounted(repository)

    await act(async () => { await latest!.loadMore() })

    expect(latest!.reminders.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('does nothing when there is no next page', async () => {
    const { repository, queries } = fakeRepository([[reminder('a', '2026-07-20T12:00:00Z')]])
    await mounted(repository)
    const before = queries.length

    await act(async () => { await latest!.loadMore() })

    expect(latest!.hasMore).toBe(false)
    expect(queries).toHaveLength(before)
  })

  it('marks a reminder read without reloading the list', async () => {
    const { repository, queries } = fakeRepository([[reminder('a', '2026-07-20T12:00:00Z')]])
    await mounted(repository)
    const before = queries.length

    await act(async () => { await latest!.markRead('a') })

    expect(latest!.reminders[0].readAt).toBeTruthy()
    expect(latest!.reminders[0].status).toBe('read')
    // Targeted: the row is patched in place, not refetched.
    expect(queries).toHaveLength(before)
  })
})

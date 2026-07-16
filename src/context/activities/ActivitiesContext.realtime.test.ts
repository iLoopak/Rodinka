// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Activity } from '../../hooks/useActivities'

const channelMock = vi.hoisted(() => vi.fn())
const removeChannelMock = vi.hoisted(() => vi.fn())
vi.mock('../../supabaseClient', () => ({
  supabase: { channel: channelMock, removeChannel: removeChannelMock },
}))

const baseActivity: Activity = {
  id: 'a1', family_id: 'family-1', title: 'Swimming', category: 'swimming', kind: 'club', all_day: false,
  child_id: null, participant_ids: [], responsible_member_id: null, secondary_responsible_member_id: null,
  location: null, coach_name: null, coach_phone: null, coach_email: null, notes: null, skill_level: null,
  start_date: '2026-07-16', end_date: null, recurrence_type: 'one_off', recurrence_weekdays: null,
  start_time: null, end_time: null, payment_amount: null, payment_frequency: null, next_payment_due_date: null,
  payment_paid_at: null, payment_paid_for_date: null, status: 'active', reminder_enabled: false,
  reminder_days_before: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

// A real (not vi.fn) stateful mock, so the provider's own setActivities calls
// actually re-render — this is what proves the realtime handler updates
// state a consumer can see, not just that a mock was called.
vi.mock('../../hooks/useActivities', () => ({
  useActivities: () => {
    const [activities, setActivities] = useState<Activity[]>([baseActivity])
    return { activities, setActivities, loading: false, error: null, refresh: vi.fn() }
  },
}))

const { ActivitiesProvider, useActivitiesData } = await import('./ActivitiesContext')

interface FakeChannel {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  emit: (event: string, table: string, row: unknown) => void
}

function makeFakeChannel(): FakeChannel {
  const handlers = new Map<string, ((payload: unknown) => void)[]>()
  const channel = {} as FakeChannel
  channel.on = vi.fn((_type: string, config: { event: string; table: string }, callback: (payload: unknown) => void) => {
    const key = `${config.event}:${config.table}`
    handlers.set(key, [...(handlers.get(key) ?? []), callback])
    return channel
  })
  channel.subscribe = vi.fn(() => channel)
  channel.emit = (event, table, row) => {
    const payload = event === 'DELETE' ? { old: row } : { new: row }
    for (const callback of handlers.get(`${event}:${table}`) ?? []) callback(payload)
  }
  return channel
}

afterEach(cleanup)

function ActivityTitle() {
  const { activities } = useActivitiesData()
  return createElement('span', { 'data-testid': 'title' }, activities[0]?.title)
}

describe('ActivitiesContext realtime', () => {
  it('reflects an activity updated from a second device without a manual refresh', async () => {
    const channel = makeFakeChannel()
    channelMock.mockReturnValue(channel)

    render(createElement(ActivitiesProvider, { familyId: 'family-1', children: createElement(ActivityTitle) }))
    expect(screen.getByTestId('title').textContent).toBe('Swimming')

    await act(async () => {
      channel.emit('UPDATE', 'activities', { ...baseActivity, title: 'Swimming (moved to Tuesdays)' })
    })

    expect(screen.getByTestId('title').textContent).toBe('Swimming (moved to Tuesdays)')
  })
})

// @vitest-environment jsdom
import { createElement } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Activity } from '../../features/activities/domain/activityTypes'
import type {
  ActivitiesRealtimeHandlers,
  ActivitiesRepository,
} from '../../features/activities/data/activitiesRepository'
import { ActivitiesProvider, useActivitiesData } from './ActivitiesContext'

const baseActivity: Activity = {
  id: 'a1', family_id: 'family-1', title: 'Swimming', category: 'swimming', kind: 'club', all_day: false,
  child_id: null, participant_ids: [], responsible_member_id: null, secondary_responsible_member_id: null,
  location: null, coach_name: null, coach_phone: null, coach_email: null, notes: null, skill_level: null,
  start_date: '2026-07-16', end_date: null, recurrence_type: 'one_off', recurrence_weekdays: null,
  start_time: null, end_time: null, payment_amount: null, payment_frequency: null, next_payment_due_date: null,
  payment_paid_at: null, payment_paid_for_date: null, status: 'active', reminder_enabled: false,
  reminder_days_before: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

/**
 * Drives the provider through the repository seam rather than a mocked
 * Supabase channel: what matters is that a change delivered by realtime
 * reaches a consumer without anyone calling refresh.
 */
function fakeRepository() {
  let handlers: ActivitiesRealtimeHandlers | null = null
  let listCalls = 0
  const repository: ActivitiesRepository = {
    async listActivities() { listCalls += 1; return [baseActivity] },
    async getActivity() { return baseActivity },
    async createSeries() { return baseActivity },
    async updateSeries() { return baseActivity },
    async markPaymentPaid() { return baseActivity },
    subscribe(_scope, next) { handlers = next; return () => { handlers = null } },
  }
  return { repository, fire: () => handlers, listCalls: () => listCalls }
}

afterEach(cleanup)

function ActivityTitle() {
  const { activities } = useActivitiesData()
  return createElement('span', { 'data-testid': 'title' }, activities[0]?.title)
}

async function mounted(repository: ActivitiesRepository) {
  render(createElement(ActivitiesProvider, { familyId: 'family-1', repository, children: createElement(ActivityTitle) }))
  await waitFor(() => expect(screen.getByTestId('title').textContent).toBe('Swimming'))
}

describe('ActivitiesContext realtime', () => {
  it('reflects an activity updated from a second device without a manual refresh', async () => {
    const { repository, fire, listCalls } = fakeRepository()
    await mounted(repository)

    await act(async () => {
      fire()?.onActivityChange({ action: 'upsert', record: { ...baseActivity, title: 'Swimming (moved to Tuesdays)' } })
    })

    expect(screen.getByTestId('title').textContent).toBe('Swimming (moved to Tuesdays)')
    // Patched in place — a realtime event must not reload the family's
    // activities.
    expect(listCalls()).toBe(1)
  })

  it('keeps the participants it already holds when an update arrives', async () => {
    const { repository, fire } = fakeRepository()
    await mounted(repository)

    await act(async () => {
      fire()?.onActivityChange({ action: 'participant-add', activityId: 'a1', memberId: 'mem-1' })
    })
    await act(async () => {
      // A realtime activities row carries no participants; the provider
      // supplies the ones on screen through resolveParticipants, so an
      // unrelated title change must not blank them.
      const resolved = fire()?.resolveParticipants('a1') ?? []
      fire()?.onActivityChange({ action: 'upsert', record: { ...baseActivity, title: 'Renamed', participant_ids: resolved } })
    })

    expect(screen.getByTestId('title').textContent).toBe('Renamed')
    expect(fire()?.resolveParticipants('a1')).toEqual(['mem-1'])
  })

  it('does not add the same participant twice when an echo arrives', async () => {
    const { repository, fire } = fakeRepository()
    await mounted(repository)

    await act(async () => {
      fire()?.onActivityChange({ action: 'participant-add', activityId: 'a1', memberId: 'mem-1' })
      fire()?.onActivityChange({ action: 'participant-add', activityId: 'a1', memberId: 'mem-1' })
    })

    expect(fire()?.resolveParticipants('a1')).toEqual(['mem-1'])
  })
})

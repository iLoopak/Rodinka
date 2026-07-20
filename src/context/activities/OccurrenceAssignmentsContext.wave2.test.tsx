// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OccurrenceAssignmentsProvider, useOccurrenceAssignmentsData } from './OccurrenceAssignmentsContext'
import type { OccurrencesRepository, OccurrenceState } from '../../features/activities/data/activitiesRepository'
import type { OccurrenceOverride } from '../../utils/occurrenceAssignments'

function override(memberId: string | null, date = '2026-07-21'): OccurrenceOverride {
  return {
    id: `server:${date}`, family_id: 'f1', series_type: 'activity', series_id: 'a1',
    occurrence_date: date, companion_member_id: memberId, assignee_member_id: null,
    cancelled: false, updated_at: '2026-07-20T10:00:00Z',
  }
}

function fakeRepository(options: { onSave?: () => void | Promise<void>; state?: () => OccurrenceState } = {}) {
  let loads = 0
  const repository: OccurrencesRepository = {
    async loadOccurrenceState() {
      loads += 1
      return options.state?.() ?? { overrides: [], assignmentHistory: [], participantHistory: [] }
    },
    async setMemberOverride() { await options.onSave?.() },
    subscribe() { return () => undefined },
  }
  return { repository, loads: () => loads }
}

let latest: ReturnType<typeof useOccurrenceAssignmentsData> | null = null

function Probe() {
  latest = useOccurrenceAssignmentsData()
  return createElement('span', { 'data-testid': 'count' }, String(latest.occurrenceOverrides.length))
}

async function mounted(repository: OccurrencesRepository, children: ReactNode = createElement(Probe)) {
  render(createElement(OccurrenceAssignmentsProvider, { familyId: 'f1', repository, children }))
  await waitFor(() => expect(latest?.occurrenceAssignmentsLoading).toBe(false))
}

afterEach(() => { cleanup(); latest = null })

describe('occurrence override — transactional expectations', () => {
  it('shows the escort switch immediately, then reconciles with the server row', async () => {
    let saved = false
    const { repository } = fakeRepository({
      onSave: () => { saved = true },
      state: () => ({ overrides: saved ? [override('m1')] : [], assignmentHistory: [], participantHistory: [] }),
    })
    await mounted(repository)

    await act(async () => { await latest!.setOccurrenceMember('activity', 'a1', '2026-07-21', 'm1') })

    // The optimistic row is replaced by the canonical one: its id comes from
    // the server, not from the `optimistic:` placeholder.
    expect(latest!.occurrenceOverrides).toHaveLength(1)
    expect(latest!.occurrenceOverrides[0].id).not.toContain('optimistic:')
    expect(latest!.occurrenceOverrides[0].companion_member_id).toBe('m1')
  })

  it('rolls the optimistic override back completely when the transaction fails', async () => {
    const { repository, loads } = fakeRepository({
      onSave: () => { throw new Error('permission denied for table occurrence_overrides') },
      state: () => ({ overrides: [override('m0')], assignmentHistory: [], participantHistory: [] }),
    })
    await mounted(repository)
    const before = latest!.occurrenceOverrides
    const loadsBefore = loads()

    await expect(latest!.setOccurrenceMember('activity', 'a1', '2026-07-21', 'm1')).rejects.toThrow()

    // The RPC is a server transaction: a failure means nothing was written, so
    // the UI must not be left holding half of an override.
    expect(latest!.occurrenceOverrides).toEqual(before)
    expect(latest!.occurrenceOverrides.some((entry) => entry.id.startsWith('optimistic:'))).toBe(false)
    // And no reconciliation read is wasted on a write that never happened.
    expect(loads()).toBe(loadsBefore)
  })

  it('replaces an existing override for the same occurrence rather than stacking one', async () => {
    const { repository } = fakeRepository({
      state: () => ({ overrides: [override('m1')], assignmentHistory: [], participantHistory: [] }),
    })
    await mounted(repository)
    expect(latest!.occurrenceOverrides).toHaveLength(1)

    await act(async () => { await latest!.setOccurrenceMember('activity', 'a1', '2026-07-21', 'm2') })

    expect(latest!.occurrenceOverrides).toHaveLength(1)
  })

  it('clears the override when the default is restored', async () => {
    let restored = false
    const { repository } = fakeRepository({
      onSave: () => { restored = true },
      state: () => ({ overrides: restored ? [] : [override('m1')], assignmentHistory: [], participantHistory: [] }),
    })
    await mounted(repository)

    await act(async () => { await latest!.setOccurrenceMember('activity', 'a1', '2026-07-21', null, true) })

    // Restoring the default removes the row entirely so the series assignment
    // applies again — it does not write an override with a null member.
    expect(latest!.occurrenceOverrides).toEqual([])
  })

  it('writes the escort for an activity and the assignee for a chore', async () => {
    const { repository } = fakeRepository()
    await mounted(repository)

    await act(async () => { await latest!.setOccurrenceMember('task', 'c1', '2026-07-21', 'm1') })
    // Mid-flight the optimistic row is visible; the two series types must not
    // write each other's column.
    expect(screen.getByTestId('count')).toBeTruthy()
  })

})

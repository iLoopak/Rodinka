// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { makeFamilyMember } from '../../utils/testFixtures'
import type { CalendarEntry } from '../../utils/calendarEntries'

const dad = makeFamilyMember({ id: 'dad', display_name: 'Lukáš', role: 'parent' })
const mom = makeFamilyMember({ id: 'mom', display_name: 'Iveta', role: 'parent' })
const allMembers = [dad, mom]
const memberById = (id: string) => allMembers.find((m) => m.id === id)

vi.mock('../../context/family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({ currentMember: dad, isParentOrAdmin: true }),
}))
vi.mock('../../context/family/FamilyMembersContext', () => ({
  useFamilyMembersData: () => ({
    members: allMembers,
    memberById,
    memberName: (id: string) => memberById(id)?.display_name ?? '?',
  }),
}))
const refreshActivities = vi.fn().mockResolvedValue(undefined)
vi.mock('../../context/activities/ActivitiesContext', () => ({
  useActivitiesData: () => ({ refreshActivities }),
}))
const setOccurrenceMember = vi.fn().mockResolvedValue(undefined)
vi.mock('../../context/activities/OccurrenceAssignmentsContext', () => ({
  useOccurrenceAssignmentsData: () => ({ setOccurrenceMember }),
}))
const calendarOfflineState: { calendarSyncStatus: 'synced' | 'offline' | 'error' | 'syncing' } = { calendarSyncStatus: 'synced' }
vi.mock('../../context/calendar/CalendarOfflineContext', () => ({
  useCalendarOffline: () => ({
    members: [],
    memberById: () => undefined,
    pendingCalendarRecords: new Map(),
    get calendarSyncStatus() { return calendarOfflineState.calendarSyncStatus },
  }),
}))
const navigateHref = vi.fn()
vi.mock('../../router', () => ({
  useRouterActions: () => ({ navigate: vi.fn(), navigateHref, setQueryParam: vi.fn(), removeQueryParam: vi.fn() }),
}))
vi.mock('../ui/ShareLinkButton', () => ({ ShareLinkButton: () => null }))

import { ActivityOccurrenceDetailModal } from './ActivityOccurrenceDetailModal'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  calendarOfflineState.calendarSyncStatus = 'synced'
})

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'activity:swim:2026-07-23',
    type: 'activity',
    category: 'swimming',
    date: '2026-07-23',
    time: '16:00',
    endTime: '17:00',
    title: 'Plavání',
    subtitle: null,
    location: 'Bazén',
    childOrPatientId: 'kid-1',
    responsibleMemberId: dad.id,
    defaultResponsibleMemberId: dad.id,
    assignmentSeriesType: 'activity',
    assignmentOverridden: false,
    participantMemberIds: ['kid-1'],
    recurring: true,
    recurrenceLabel: 'Každé pondělí',
    sourceType: 'activity',
    sourceId: 'swim',
    ...overrides,
  }
}

describe('ActivityOccurrenceDetailModal', () => {
  it('labels itself as a specific occurrence and shows the default responsible adult', () => {
    render(<ActivityOccurrenceDetailModal entry={entry()} onClose={vi.fn()} />)
    expect(screen.getByText(t.activities.occurrenceLabel)).toBeTruthy()
    expect(screen.getByText(t.activities.defaultResponsibleAdultLabel)).toBeTruthy()
    expect(screen.getAllByText('Lukáš').length).toBeGreaterThan(0)
  })

  it('shows the current occurrence companion separately from the series default when overridden', () => {
    render(<ActivityOccurrenceDetailModal entry={entry({ responsibleMemberId: mom.id, assignmentOverridden: true })} onClose={vi.fn()} />)
    expect(screen.getByText(t.activities.defaultResponsibleAdultLabel)).toBeTruthy()
    expect(screen.getAllByText('Lukáš').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Iveta').length).toBeGreaterThan(0)
    // Modal content is portalled onto document.body (outside RTL's own
    // container div), so this must query the whole document.
    expect(document.querySelector(`[aria-label="${t.calendar.occurrenceOverrideBadge}"]`)).toBeTruthy()
  })

  it('disables save until a different companion is picked, then saves only that occurrence', async () => {
    render(<ActivityOccurrenceDetailModal entry={entry()} onClose={vi.fn()} />)
    const saveButton = screen.getByRole('button', { name: t.activities.saveOccurrenceChange }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Iveta/ }))
    expect(saveButton.disabled).toBe(false)

    fireEvent.click(saveButton)
    await waitFor(() => expect(setOccurrenceMember).toHaveBeenCalledWith('activity', 'swim', '2026-07-23', mom.id, false))
    // The save button re-disables once the pick matches what was just saved.
    await waitFor(() => expect(saveButton.disabled).toBe(true))
    expect(refreshActivities).toHaveBeenCalledTimes(1)
  })

  it('keeps the series default label showing the original adult after an occurrence-only change', async () => {
    render(<ActivityOccurrenceDetailModal entry={entry()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Iveta/ }))
    const saveButton = screen.getByRole('button', { name: t.activities.saveOccurrenceChange }) as HTMLButtonElement
    fireEvent.click(saveButton)
    await waitFor(() => expect(saveButton.disabled).toBe(true))

    const defaultLabel = screen.getByText(t.activities.defaultResponsibleAdultLabel)
    expect(defaultLabel.parentElement?.textContent).toContain('Lukáš')
  })

  it('restoring the default companion clears the override instead of storing a duplicate value', async () => {
    render(<ActivityOccurrenceDetailModal entry={entry({ responsibleMemberId: mom.id, assignmentOverridden: true })} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: t.calendar.restoreDefaultCompanion }))
    fireEvent.click(screen.getByRole('button', { name: t.activities.saveOccurrenceChange }))
    await waitFor(() => expect(setOccurrenceMember).toHaveBeenCalledWith('activity', 'swim', '2026-07-23', dad.id, true))
  })

  it('handles a removed or unknown family member without crashing', () => {
    render(<ActivityOccurrenceDetailModal entry={entry({ defaultResponsibleMemberId: 'ghost', responsibleMemberId: 'ghost' })} onClose={vi.fn()} />)
    expect(screen.getByText(t.activities.defaultResponsibleAdultLabel)).toBeTruthy()
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('opens the full activity detail via deep link and closes itself', () => {
    const onClose = vi.fn()
    render(<ActivityOccurrenceDetailModal entry={entry()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: t.activities.fullActivityDetail }))
    expect(navigateHref).toHaveBeenCalledWith(expect.stringContaining('/activities'))
    expect(navigateHref).toHaveBeenCalledWith(expect.stringContaining('activity=swim'))
    expect(onClose).toHaveBeenCalled()
  })

  it('disables companion changes while the calendar snapshot is offline/read-only', () => {
    calendarOfflineState.calendarSyncStatus = 'offline'
    render(<ActivityOccurrenceDetailModal entry={entry()} onClose={vi.fn()} />)
    expect(screen.getByText(t.calendar.offlineReadOnly)).toBeTruthy()
    expect(screen.queryByRole('button', { name: t.activities.saveOccurrenceChange })).toBeNull()
    expect((screen.getByRole('button', { name: /Iveta/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

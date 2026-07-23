// @vitest-environment jsdom
//
// Entry-point contract: Today and Calendar both open CalendarEntryDetailModal
// for whatever CalendarEntry was clicked. This locks in that activity entries
// get routed to the unified ActivityOccurrenceDetailModal (CC_PROMPT_ACTIVITY_
// OCCURRENCE_MODAL brief), while every other source type keeps the existing
// generic detail view untouched.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { makeFamilyMember } from '../../utils/testFixtures'
import type { CalendarEntry } from '../../utils/calendarEntries'

const dad = makeFamilyMember({ id: 'dad', display_name: 'Lukáš', role: 'parent' })
const kid = makeFamilyMember({ id: 'kid', display_name: 'Ema', role: 'child' })
const allMembers = [dad, kid]
const memberById = (id: string) => allMembers.find((m) => m.id === id)

vi.mock('../../context/family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({ currentMember: dad, isParentOrAdmin: true }),
}))
vi.mock('../../context/family/FamilyMembersContext', () => ({
  useFamilyMembersData: () => ({ members: allMembers, memberById, memberName: (id: string) => memberById(id)?.display_name ?? '?' }),
}))
vi.mock('../../context/chores/ChoresContext', () => ({
  useChoresData: () => ({ chores: [], latestCompletionFor: () => null, markDone: vi.fn(), refreshChores: vi.fn() }),
}))
vi.mock('../../context/health/MedicalContext', () => ({
  useMedicalData: () => ({ medicalRecords: [], updateMedicalRecord: vi.fn() }),
}))
vi.mock('../../context/activities/ActivitiesContext', () => ({
  useActivitiesData: () => ({ refreshActivities: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../context/activities/OccurrenceAssignmentsContext', () => ({
  useOccurrenceAssignmentsData: () => ({ setOccurrenceMember: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../router', () => ({
  useRouterActions: () => ({ navigate: vi.fn(), navigateHref: vi.fn(), setQueryParam: vi.fn(), removeQueryParam: vi.fn() }),
}))
vi.mock('../../context/calendar/CalendarOfflineContext', () => ({
  useCalendarOffline: () => ({
    members: [], memberById: () => undefined, chores: [], medicalRecords: [], activities: [],
    pendingCalendarRecords: new Map(), calendarSyncStatus: 'synced',
    updatePendingCalendarRecord: vi.fn(), retryCalendarRecord: vi.fn(), discardCalendarRecord: vi.fn(),
  }),
}))
vi.mock('../ui/ShareLinkButton', () => ({ ShareLinkButton: () => null }))

import { CalendarEntryDetailModal } from './CalendarEntryDetailModal'

afterEach(cleanup)

function activityEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'activity:swim:2026-07-23',
    type: 'activity',
    category: 'swimming',
    date: '2026-07-23',
    time: '16:00',
    title: 'Plavání',
    subtitle: null,
    childOrPatientId: kid.id,
    responsibleMemberId: dad.id,
    defaultResponsibleMemberId: dad.id,
    assignmentSeriesType: 'activity',
    assignmentOverridden: false,
    participantMemberIds: [kid.id],
    recurring: true,
    sourceType: 'activity',
    sourceId: 'swim',
    ...overrides,
  }
}

function choreEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'chore:weekly',
    type: 'chore',
    date: '2026-07-23',
    time: null,
    title: 'Vytřít podlahu',
    subtitle: null,
    childOrPatientId: kid.id,
    responsibleMemberId: kid.id,
    assignmentSeriesType: 'task',
    assignmentOverridden: false,
    participantMemberIds: [kid.id],
    recurring: true,
    sourceType: 'chore',
    sourceId: 'weekly',
    ...overrides,
  }
}

describe('CalendarEntryDetailModal entry-point routing', () => {
  it('opens the unified occurrence detail for activity entries (Today/Calendar)', () => {
    render(<CalendarEntryDetailModal entry={activityEntry()} onClose={vi.fn()} />)
    expect(screen.getByText(t.activities.occurrenceLabel)).toBeTruthy()
    expect(screen.getByRole('button', { name: t.activities.fullActivityDetail })).toBeTruthy()
  })

  it('keeps the existing generic detail view for non-activity entries (e.g. chores)', () => {
    render(<CalendarEntryDetailModal entry={choreEntry()} onClose={vi.fn()} />)
    expect(screen.queryByText(t.activities.occurrenceLabel)).toBeNull()
    expect(screen.getByText(t.calendar.assigneeTitle)).toBeTruthy()
  })
})

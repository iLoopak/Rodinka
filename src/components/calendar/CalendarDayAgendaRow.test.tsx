import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { makeFamilyMember } from '../../utils/testFixtures'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { CalendarDayAgendaRow } from './CalendarDayAgendaRow'

const member = makeFamilyMember({ id: 'terra', display_name: 'Terra' })
const memberById = (id: string) => id === member.id ? member : undefined

const mealEntry: CalendarEntry = {
  id: 'meal:1',
  type: 'meal',
  date: '2026-07-16',
  time: null,
  title: 'Fazole alá chilli con carne',
  subtitle: null,
  childOrPatientId: member.id,
  participantMemberIds: [member.id],
  responsibleMemberId: member.id,
  assignmentSeriesType: undefined,
  recurring: false,
  sourceType: 'meal',
  sourceId: '1',
}

const activityEntry: CalendarEntry = {
  id: 'activity:1',
  type: 'activity',
  date: '2026-07-16',
  time: '16:30:00',
  endTime: '17:15:00',
  title: 'Plavání',
  subtitle: null,
  childOrPatientId: member.id,
  participantMemberIds: [member.id],
  responsibleMemberId: member.id,
  assignmentSeriesType: 'activity',
  recurring: true,
  recurrenceLabel: 'Každý pátek',
  location: 'Bazen Nekky',
  sourceType: 'activity',
  sourceId: '1',
}

describe('CalendarDayAgendaRow', () => {
  it('renders meal entry compactly without "Bez času" label', () => {
    const html = renderToStaticMarkup(createElement(CalendarDayAgendaRow, {
      entry: mealEntry,
      memberById,
      onClick: vi.fn(),
    }))

    expect(html).toContain('class="day-agenda-row')
    expect(html).not.toContain('Bez času')
    expect(html).toContain('Fazole alá chilli con carne')
    expect(html).toContain('Terra')
    expect(html).toContain('item-type-icon')
    expect(html).not.toContain('week-entry-time')
  })

  it('renders timed activity with time, location, and recurrence', () => {
    const html = renderToStaticMarkup(createElement(CalendarDayAgendaRow, {
      entry: activityEntry,
      memberById,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html).toContain('16:30–17:15')
    expect(html).toContain('Plavání')
    expect(html).toContain('Bazen Nekky')
    expect(html).toContain('Každý pátek')
    expect(html).toContain('day-agenda-row-assignment')
    expect(html).toContain('day-agenda-row-swap')
  })

  it('shows occurrence override dot when assignmentOverridden is true', () => {
    const entryWithOverride = { ...activityEntry, assignmentOverridden: true }
    const html = renderToStaticMarkup(createElement(CalendarDayAgendaRow, {
      entry: entryWithOverride,
      memberById,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html).toContain('day-agenda-row-override-dot')
    expect(html).toContain('Změněno pouze pro tento termín')
  })

  it('shows responsible member when no assignment control', () => {
    const entryNoAssignment = { ...activityEntry, assignmentSeriesType: undefined, responsibleMemberId: 'other-member' }
    const memberById = (id: string) => id === 'other-member' ? makeFamilyMember({ id: 'other-member', display_name: 'Ostatní' }) : member
    const html = renderToStaticMarkup(createElement(CalendarDayAgendaRow, {
      entry: entryNoAssignment,
      memberById,
      onClick: vi.fn(),
    }))

    expect(html).toContain('day-agenda-row-responsible')
    expect(html).toContain('Ostatní')
    expect(html).not.toContain('day-agenda-row-assignment')
  })

  it('shows completed status', () => {
    const completedEntry = { ...mealEntry, completed: true }
    const html = renderToStaticMarkup(createElement(CalendarDayAgendaRow, {
      entry: completedEntry,
      memberById,
      onClick: vi.fn(),
    }))

    expect(html).toContain('completed')
    expect(html).toContain('Hotovo')
  })
})
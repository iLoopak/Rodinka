import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { makeFamilyMember } from '../../utils/testFixtures'
import { CalendarEntryRow } from './CalendarEntryRow'

const member = makeFamilyMember({ id: 'terra', display_name: 'Terra' })

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'chore:weekly',
    type: 'chore',
    date: '2026-07-14',
    time: null,
    title: 'Weekly task',
    subtitle: null,
    childOrPatientId: member.id,
    responsibleMemberId: member.id,
    participantMemberIds: [member.id],
    recurring: true,
    sourceType: 'chore',
    sourceId: 'weekly',
    ...overrides,
  }
}

describe('CalendarEntryRow', () => {
  it('renders a readable content hierarchy with person metadata and due status', () => {
    const html = renderToStaticMarkup(createElement(CalendarEntryRow, {
      entry: entry(),
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
    }))

    expect(html).toContain('class="calendar-entry-content"')
    expect(html).toContain('class="calendar-entry-meta-line"')
    expect(html).toContain('class="calendar-entry-side"')
    expect(html).toContain('Weekly task')
    expect(html).toContain('Terra')
  })

  it('keeps completion state in the shared due badge', () => {
    const html = renderToStaticMarkup(createElement(CalendarEntryRow, {
      entry: entry({ completed: true }),
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
    }))

    expect(html).toContain('badge badge-done')
  })

  it('shows the same person only once while keeping an explicit assignment action', () => {
    const html = renderToStaticMarkup(createElement(CalendarEntryRow, {
      entry: entry({ assignmentSeriesType: 'task' }),
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html.match(/class="member-avatar/g)).toHaveLength(1)
    expect(html).toContain('class="assignment-change-indicator"')
    expect(html).toContain('Změnit přiřazení pro tento termín')
  })

  it('labels a different responsible person and preserves occurrence override state', () => {
    const adult = makeFamilyMember({ id: 'adult', display_name: 'Alex' })
    const html = renderToStaticMarkup(createElement(CalendarEntryRow, {
      entry: entry({ responsibleMemberId: adult.id, assignmentSeriesType: 'activity', assignmentOverridden: true }),
      memberById: (id) => id === member.id ? member : id === adult.id ? adult : undefined,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html).toContain('Zodpovídá: Alex')
    expect(html).toContain('Změnit doprovod pro tento termín: Alex')
    expect(html).toContain('assignment-change-indicator overridden')
    expect(html.match(/class="member-avatar/g)).toHaveLength(2)
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { makeFamilyMember } from '../../utils/testFixtures'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { WeekCalendarEntryRow } from './WeekCalendarEntryRow'

const member = makeFamilyMember({ id: 'terra', display_name: 'Terra' })
const entry: CalendarEntry = {
  id: 'chore:weekly',
  type: 'chore',
  date: '2026-07-16',
  time: null,
  title: 'Weekly task',
  subtitle: null,
  childOrPatientId: member.id,
  participantMemberIds: [member.id],
  responsibleMemberId: member.id,
  assignmentSeriesType: 'task',
  recurring: true,
  sourceType: 'chore',
  sourceId: 'weekly',
}

describe('WeekCalendarEntryRow', () => {
  it('renders the assigned member only once when the assignment control is available', () => {
    const html = renderToStaticMarkup(createElement(WeekCalendarEntryRow, {
      entry,
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html.match(/class="member-avatar/g)).toHaveLength(1)
    expect(html).toContain('width:36px;height:36px')
    expect(html).toContain('class="week-entry-assignment"')
    expect(html).not.toContain('class="avatar-stack"')
  })

  it('overlays the occurrence indicator without moving the assignment photo', () => {
    const html = renderToStaticMarkup(createElement(WeekCalendarEntryRow, {
      entry: { ...entry, assignmentOverridden: true },
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html).toContain('class="assignment-override-indicator"')
    expect(html).toContain('width:36px;height:36px')
  })

  it('keeps participant avatars when there is no assignment control', () => {
    const html = renderToStaticMarkup(createElement(WeekCalendarEntryRow, {
      entry: { ...entry, assignmentSeriesType: undefined },
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
    }))

    expect(html.match(/class="member-avatar/g)).toHaveLength(1)
    expect(html).toContain('class="avatar-stack"')
    expect(html).not.toContain('week-entry-assignment')
  })
})

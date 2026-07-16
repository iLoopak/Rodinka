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
  it('uses a single vertical hierarchy with a compact assignment control', () => {
    const html = renderToStaticMarkup(createElement(WeekCalendarEntryRow, {
      entry,
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html.match(/class="member-avatar/g)).toHaveLength(1)
    expect(html).toContain('width:30px;height:30px')
    expect(html).toContain('class="week-entry-assignment"')
    expect(html).not.toContain('class="avatar-stack"')
    expect(html).not.toContain('week-entry-side')
    expect(html).not.toContain('due-badge')
    expect(html.indexOf('<strong>Weekly task</strong>')).toBeLessThan(html.indexOf('week-entry-time'))
    expect(html.indexOf('week-entry-time')).toBeLessThan(html.indexOf('week-entry-assignment'))
  })

  it('overlays the occurrence indicator without moving the assignment photo', () => {
    const html = renderToStaticMarkup(createElement(WeekCalendarEntryRow, {
      entry: { ...entry, assignmentOverridden: true },
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html).toContain('class="week-entry-override-dot"')
    expect(html).toContain('width:30px;height:30px')
    expect(html).toContain('Změněno pouze pro tento termín')
  })

  it('keeps participant information readable without an avatar column', () => {
    const html = renderToStaticMarkup(createElement(WeekCalendarEntryRow, {
      entry: { ...entry, assignmentSeriesType: undefined },
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
    }))

    expect(html).toContain('<span>Terra</span>')
    expect(html).not.toContain('class="avatar-stack"')
    expect(html).not.toContain('week-entry-assignment')
  })

  it('puts activity metadata on separate rows and uses the detailed recurrence label', () => {
    const html = renderToStaticMarkup(createElement(WeekCalendarEntryRow, {
      entry: {
        ...entry,
        type: 'activity',
        title: 'Swimming',
        time: '16:30:00',
        endTime: '17:15:00',
        location: 'Nekky JS',
        recurrenceLabel: 'Každý pátek',
        assignmentSeriesType: 'activity',
      },
      memberById: (id) => id === member.id ? member : undefined,
      onClick: vi.fn(),
      onAssignmentClick: vi.fn(),
    }))

    expect(html).toContain('16:30–17:15')
    expect(html).toContain('<span>Nekky JS</span>')
    expect(html).toContain('<span>Každý pátek</span>')
    expect(html.match(/class="week-entry-meta-row"/g)).toHaveLength(3)
  })
})

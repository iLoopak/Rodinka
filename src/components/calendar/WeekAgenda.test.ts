import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { WeekAgenda } from './WeekAgenda'

function calendarEntry(id: string, time: string | null): CalendarEntry {
  return {
    id,
    type: 'activity',
    date: '2026-07-15',
    time,
    endTime: time ? '11:00' : null,
    title: id === 'first' ? 'Swimming' : 'Family lunch',
    subtitle: null,
    childOrPatientId: null,
    responsibleMemberId: null,
    recurring: id === 'first',
    sourceType: 'activity',
    sourceId: id,
  }
}

function renderWeek(entries: CalendarEntry[] = []) {
  return renderToStaticMarkup(createElement(WeekAgenda, {
    weekStart: '2026-07-13',
    entries,
    today: '2026-07-14',
    selectedDay: '2026-07-14',
    scrollVersion: 0,
    memberById: () => undefined,
    onChangeWeek: vi.fn(),
    onSelectDay: vi.fn(),
    onSelectEntry: vi.fn(),
    onChangeAssignment: vi.fn(),
    onAddDay: vi.fn(),
  }))
}

describe('WeekAgenda', () => {
  it('renders Monday through Sunday as seven chronological agenda cards', () => {
    const html = renderWeek()
    const dates = [...html.matchAll(/data-week-date="([^"]+)"/g)].map((match) => match[1])

    expect(html).toContain('data-layout="vertical-agenda"')
    expect(dates).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
      '2026-07-17', '2026-07-18', '2026-07-19',
    ])
    expect(html.match(/class="week-strip-day/g)).toHaveLength(7)
  })

  it('keeps empty days compact and stacks multiple events inside their day', () => {
    const html = renderWeek([calendarEntry('first', '09:30'), calendarEntry('second', null)])

    expect(html.match(/class="week-day-empty"/g)).toHaveLength(6)
    expect(html.match(/class="week-day-add-small"/g)).toHaveLength(6)
    expect(html.match(/<li class="week-entry(?:\s|completed|")/g)).toHaveLength(2)
    expect(html).toContain('Swimming')
    expect(html).toContain('Family lunch')
  })
})

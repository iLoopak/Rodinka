import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CalendarDayAgendaCard } from './CalendarDayAgendaCard'
import type { CalendarEntry } from '../../utils/calendarEntries'

function renderCard(entries: CalendarEntry[] = [], onClose?: () => void) {
  return renderToStaticMarkup(createElement(CalendarDayAgendaCard, {
    date: '2026-07-06',
    entries,
    today: '2026-07-14',
    memberById: () => undefined,
    onSelectEntry: vi.fn(),
    onAddDay: vi.fn(),
    onClose,
  }))
}

describe('CalendarDayAgendaCard', () => {
  it('uses the compact day-agenda-card class and empty state', () => {
    const html = renderCard()

    expect(html).toContain('class="day-agenda-card')
    expect(html).toContain('class="day-agenda-empty"')
    expect(html).toContain('class="link day-agenda-add"')
    expect(html).toContain('0 položek')
  })

  it('adds only the optional month-detail close control', () => {
    expect(renderCard([])).not.toContain('calendar-day-close')
    expect(renderCard([], vi.fn())).toContain('calendar-day-close')
  })

  it('renders compact day-agenda-group with untimed entries', () => {
    const entry: CalendarEntry = {
      id: 'meal:1',
      type: 'meal',
      date: '2026-07-06',
      time: null,
      title: 'Fazole',
      subtitle: null,
      childOrPatientId: null,
      participantMemberIds: [],
      responsibleMemberId: null,
      assignmentSeriesType: undefined,
      recurring: false,
      sourceType: 'meal',
      sourceId: '1',
    }
    const html = renderCard([entry])

    expect(html).toContain('class="day-agenda-groups"')
    expect(html).toContain('class="day-agenda-group"')
    expect(html).toContain('Celý den a bez času')
  })

  it('renders compact day-agenda-group with timed entries', () => {
    const entry: CalendarEntry = {
      id: 'activity:1',
      type: 'activity',
      date: '2026-07-06',
      time: '16:30:00',
      endTime: '17:15:00',
      title: 'Plavání',
      subtitle: null,
      childOrPatientId: null,
      participantMemberIds: [],
      responsibleMemberId: null,
      assignmentSeriesType: undefined,
      recurring: true,
      recurrenceLabel: 'Každý pátek',
      location: 'Bazen Nekky',
      sourceType: 'activity',
      sourceId: '1',
    }
    const html = renderCard([entry])

    expect(html).toContain('Podle času')
    expect(html).toContain('16:30–17:15')
    expect(html).toContain('Bazen Nekky')
    expect(html).toContain('Každý pátek')
  })
})
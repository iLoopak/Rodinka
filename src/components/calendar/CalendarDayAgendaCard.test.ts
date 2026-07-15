import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CalendarDayAgendaCard } from './CalendarDayAgendaCard'

function renderCard(onClose?: () => void) {
  return renderToStaticMarkup(createElement(CalendarDayAgendaCard, {
    date: '2026-07-06',
    entries: [],
    today: '2026-07-14',
    memberById: () => undefined,
    onSelectEntry: vi.fn(),
    onAddDay: vi.fn(),
    onClose,
  }))
}

describe('CalendarDayAgendaCard', () => {
  it('uses the shared lightweight empty state and footer action', () => {
    const html = renderCard()

    expect(html).toContain('class="week-day-card"')
    expect(html).toContain('class="week-day-empty"')
    expect(html).toContain('class="link week-day-add"')
    expect(html).toContain('0 položek')
  })

  it('adds only the optional month-detail close control', () => {
    expect(renderCard()).not.toContain('calendar-day-close')
    expect(renderCard(vi.fn())).toContain('calendar-day-close')
  })
})

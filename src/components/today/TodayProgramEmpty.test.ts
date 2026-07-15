import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TodayProgramEmpty } from './TodayProgramEmpty'

describe('TodayProgramEmpty', () => {
  it('uses a compact inline state without a nested branded card', () => {
    const html = renderToStaticMarkup(createElement(TodayProgramEmpty, { onAdd: vi.fn() }))

    expect(html).toContain('today-program-empty')
    expect(html).toContain('Dnes nemáte nic naplánováno')
    expect(html).toContain('Přidat')
    expect(html).not.toContain('empty-state-card')
    expect(html).not.toContain('family-mark')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { makeChore } from '../../utils/testFixtures'
import { QuickTodoPriorityList } from './QuickTodoPriorityList'

describe('QuickTodoPriorityList', () => {
  it('renders the dedicated priority list with reorder handles outside Today', () => {
    const html = renderToStaticMarkup(createElement(QuickTodoPriorityList, {
      tasks: [makeChore({ id: 'quick-1', title: 'Zavolat' })],
      onComplete: vi.fn(), onPromote: vi.fn(), onReorder: vi.fn(),
    }))
    expect(html).toContain('Přesunout úkol Zavolat')
    expect(html).toContain('aria-roledescription="sortable"')
    expect(html).toContain('Dokončit úkol Zavolat')
    expect(html).toContain('Doplnit')
  })
})

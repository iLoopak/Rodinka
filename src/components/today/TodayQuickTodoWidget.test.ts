import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { makeChore } from '../../utils/testFixtures'
import { TodayQuickTodoWidget } from './TodayQuickTodoWidget'

describe('TodayQuickTodoWidget', () => {
  it('renders quick tasks with completion as the primary action and promotion as secondary', () => {
    const html = renderToStaticMarkup(createElement(TodayQuickTodoWidget, {
      tasks: [makeChore({ id: 'task-1', title: 'Zavolat instalatérovi' })],
      onAdd: vi.fn(), onComplete: vi.fn(), onPromote: vi.fn(), onOpenAll: vi.fn(),
    }))

    expect(html).toContain('Rychlé úkoly')
    expect(html).toContain('Zavolat instalatérovi')
    expect(html).toContain('Dokončit úkol Zavolat instalatérovi')
    expect(html).toContain('Doplnit')
    expect(html).not.toContain('list-drag-handle')
    expect(html).toMatch(/class="completion-checkbox"[^>]*><span aria-hidden="true"><\/span><\/button>/)
  })

  it('keeps a compact empty inbox with the quick-entry field', () => {
    const html = renderToStaticMarkup(createElement(TodayQuickTodoWidget, {
      tasks: [], onAdd: vi.fn(), onComplete: vi.fn(), onPromote: vi.fn(), onOpenAll: vi.fn(),
    }))
    expect(html).toContain('Přidat úkol…')
    expect(html).toContain('Žádné rychlé úkoly')
  })

  it('limits Today to five priority tasks and offers the rest on demand', () => {
    const tasks = Array.from({ length: 6 }, (_, index) => makeChore({ id: `task-${index + 1}`, title: `Úkol ${index + 1}`, sort_order: index }))
    const html = renderToStaticMarkup(createElement(TodayQuickTodoWidget, {
      tasks, onAdd: vi.fn(), onComplete: vi.fn(), onPromote: vi.fn(), onOpenAll: vi.fn(),
    }))

    expect(html).toContain('Úkol 1')
    expect(html).toContain('Úkol 5')
    expect(html).not.toContain('Úkol 6')
    expect(html).toContain('+1 další úkol')
  })
})

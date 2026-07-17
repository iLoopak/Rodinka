// @vitest-environment jsdom
import { createElement, type AnchorHTMLAttributes } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../router', () => ({
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => createElement('a', { href: to, ...props }),
}))

import { PlannerAreaCard } from './PlannerAreaCard'

describe('PlannerAreaCard', () => {
  it('keeps the overview link and create action together without nesting controls', () => {
    const html = renderToStaticMarkup(createElement(PlannerAreaCard, {
      to: '/chores',
      icon: 'T',
      colorVar: '--category-tasks',
      title: 'Household tasks',
      summary: '8 active',
      details: ['1 overdue'],
      ariaLabel: 'Open household tasks',
      createLabel: 'Add task',
      onCreate: vi.fn(),
    }))

    expect(html).toContain('class="planner-area-link"')
    expect(html).toContain('class="planner-area-create"')
    expect(html).toContain('aria-label="Add task"')
    expect(html).toContain('<svg')
    expect(html).not.toContain('aria-label="Add task: Household tasks"')
    expect(html).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*<button/s)
  })

  it('runs only the create action when the compact button is clicked', () => {
    const onCreate = vi.fn()
    const onParentClick = vi.fn()

    render(createElement(
      'div',
      { onClick: onParentClick },
      createElement(PlannerAreaCard, {
        to: '/chores',
        icon: 'T',
        colorVar: '--category-tasks',
        title: 'Household tasks',
        summary: '8 active',
        details: [],
        ariaLabel: 'Open household tasks',
        createLabel: 'Add task',
        onCreate,
      })
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onParentClick).not.toHaveBeenCalled()
  })
})

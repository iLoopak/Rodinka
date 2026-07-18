// @vitest-environment jsdom
import { createElement, type AnchorHTMLAttributes } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../router', () => ({
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => createElement('a', { href: to, ...props }),
}))

import { PlannerAreaCard } from './PlannerAreaCard'

describe('PlannerAreaCard', () => {
  it('renders one calm navigation row without a duplicate create action', () => {
    const html = renderToStaticMarkup(createElement(PlannerAreaCard, {
      to: '/chores',
      icon: 'T',
      colorVar: '--category-tasks',
      title: 'Household tasks',
      summary: '8 active',
      details: ['1 overdue'],
      ariaLabel: 'Open household tasks',
    }))

    expect(html).toContain('class="planner-area-link"')
    expect(html).toContain('class="planner-area-chevron"')
    expect(html).not.toContain('planner-area-create')
    expect(html).not.toContain('<button')
  })
})

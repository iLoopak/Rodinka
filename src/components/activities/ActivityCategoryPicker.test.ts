import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_CATEGORY_VALUES, activityCategoryLabel } from '../../utils/activityLabels'
import { ActivityCategoryPicker } from './ActivityCategoryPicker'

function render(value: (typeof ACTIVITY_CATEGORY_VALUES)[number]) {
  return renderToStaticMarkup(createElement(ActivityCategoryPicker, { value, onChange: vi.fn() }))
}

describe('ActivityCategoryPicker', () => {
  it('renders one radio chip per category, each with an icon and its label', () => {
    const html = render('other')
    expect(html.match(/role="radio"/g)).toHaveLength(ACTIVITY_CATEGORY_VALUES.length)
    expect(html.match(/<svg/g)).toHaveLength(ACTIVITY_CATEGORY_VALUES.length)
    for (const category of ACTIVITY_CATEGORY_VALUES) {
      expect(html).toContain(activityCategoryLabel(category))
    }
  })

  it('marks exactly the selected category as checked', () => {
    const html = render('swimming')
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    const checked = html.match(/aria-checked="true"[\s\S]*?<\/button>/)?.[0]
    expect(checked).toContain(activityCategoryLabel('swimming'))
  })

  it('is a single radiogroup, not a multi-select', () => {
    const html = render('football')
    expect(html).toContain('role="radiogroup"')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeFamilyMember } from '../utils/testFixtures'
import { FamilyMark } from './FamilyMark'

function member(id: string, color_key: 'brick' | 'coral' | 'sky' | 'sage' | 'honey' | 'lavender' | 'berry') {
  return makeFamilyMember({ id, color_key })
}

describe('FamilyMark', () => {
  it('is decorative and reflects each member accent at small sizes', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, {
      members: [member('b', 'coral'), member('a', 'sage'), member('c', 'lavender')],
      size: 30,
    }))

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-member-count="3"')
    expect(html).toContain('var(--coral)')
    expect(html).toContain('var(--accent-sage)')
    expect(html).toContain('var(--accent-lavender)')
    expect(html.match(/family-mark-petal/g)).toHaveLength(3)
  })

  it('updates for add, remove and accent changes', () => {
    const one = renderToStaticMarkup(createElement(FamilyMark, { members: [member('a', 'sky')] }))
    const two = renderToStaticMarkup(createElement(FamilyMark, { members: [member('a', 'sky'), member('b', 'honey')] }))
    const recolored = renderToStaticMarkup(createElement(FamilyMark, { members: [member('a', 'berry')] }))

    expect(one).toContain('data-member-count="1"')
    expect(two).toContain('data-member-count="2"')
    expect(two).toContain('var(--accent-honey)')
    expect(recolored).toContain('var(--accent-berry)')
    expect(recolored).not.toContain('var(--accent-sky)')
  })

  it('represents remaining member colors in a labelled overflow petal', () => {
    const family = [
      member('a', 'brick'), member('b', 'coral'), member('c', 'sky'), member('d', 'sage'),
      member('e', 'honey'), member('f', 'lavender'), member('g', 'berry'), member('h', 'sky'),
    ]
    const html = renderToStaticMarkup(createElement(FamilyMark, { members: family }))

    expect(html).toContain('data-member-count="8"')
    expect(html).toContain('>+3</text>')
    expect(html).toContain('var(--accent-lavender)')
    expect(html).toContain('var(--accent-berry)')
  })

  it('uses a neutral placeholder without stale colors while loading', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, {
      members: [member('a', 'berry')], loading: true,
    }))
    expect(html).toContain('is-loading')
    expect(html).not.toContain('var(--accent-berry)')
    expect(html).not.toContain('data-member-count')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeFamilyMember } from '../utils/testFixtures'
import { FamilyMark } from './FamilyMark'

const supportedSizes = [16, 20, 24, 32, 48, 64, 96, 128]

function member(id: string, color_key: 'brick' | 'coral' | 'sky' | 'sage' | 'honey' | 'lavender' | 'berry') {
  return makeFamilyMember({ id, color_key })
}

describe('FamilyMark', () => {
  it('is decorative and reflects each member accent at small sizes', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, {
      variant: 'dynamic',
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
    const one = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: [member('a', 'sky')] }))
    const two = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: [member('a', 'sky'), member('b', 'honey')] }))
    const recolored = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: [member('a', 'berry')] }))

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
    const html = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: family }))

    expect(html).toContain('data-member-count="8"')
    expect(html).toContain('>+3</text>')
    expect(html).toContain('var(--accent-lavender)')
    expect(html).toContain('var(--accent-berry)')
  })

  it('uses a neutral placeholder without stale colors while loading', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, {
      variant: 'dynamic', members: [member('a', 'berry')], loading: true,
    }))
    expect(html).toContain('is-loading')
    expect(html).not.toContain('var(--accent-berry)')
    expect(html).not.toContain('data-member-count')
  })

  it.each(supportedSizes)('preserves the same geometry and aspect ratio at %i px', (size) => {
    const html = renderToStaticMarkup(createElement(FamilyMark, { variant: 'static', size }))
    expect(html).toContain(`width="${size}"`)
    expect(html).toContain(`height="${size}"`)
    expect(html).toContain('viewBox="0 0 64 64"')
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(html).toContain('shape-rendering="geometricPrecision"')
    expect(html.match(/family-mark-petal/g)).toHaveLength(4)
  })

  it('supports decorative and explicitly labelled brand modes', () => {
    const decorative = renderToStaticMarkup(createElement(FamilyMark, { variant: 'static' }))
    const labelled = renderToStaticMarkup(createElement(FamilyMark, {
      variant: 'static', decorative: false, label: 'Rodinka',
    }))
    expect(decorative).toContain('aria-hidden="true"')
    expect(labelled).toContain('role="img"')
    expect(labelled).toContain('aria-label="Rodinka"')
    expect(labelled).not.toContain('aria-hidden')
  })

  it('keeps overflow text out of sub-32px marks for crisp rendering', () => {
    const family = Array.from({ length: 8 }, (_, index) => member(String(index), 'sky'))
    const small = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: family, size: 20 }))
    const regular = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: family, size: 32 }))
    expect(small).not.toContain('family-mark-overflow-label')
    expect(regular).toContain('family-mark-overflow-label')
  })
})

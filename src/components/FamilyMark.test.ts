import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeFamilyMember } from '../utils/testFixtures'
import { FamilyMark } from './FamilyMark'

const supportedSizes = [16, 20, 24, 32, 48, 64, 96, 128]

function member(id: string, color_key: 'brick' | 'coral' | 'sky' | 'sage' | 'honey' | 'lavender' | 'berry') {
  return makeFamilyMember({ id, color_key })
}

const countShapes = (html: string) => html.match(/family-mark-petal/g)?.length ?? 0

describe('FamilyMark', () => {
  it('is decorative and gives every member a brand-palette shape', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, {
      variant: 'dynamic',
      members: [member('b', 'coral'), member('a', 'sage'), member('c', 'honey')],
      size: 30,
    }))

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-member-count="3"')
    expect(html).toContain('var(--brand-coral)')
    expect(html).toContain('var(--brand-mint)')
    expect(html).toContain('var(--brand-honey)')
    expect(countShapes(html)).toBe(3)
  })

  it('draws the mark from the landing palette, never the member identity palette', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, {
      variant: 'dynamic',
      members: [member('a', 'lavender'), member('b', 'berry')],
    }))
    expect(html).not.toContain('var(--member-')
  })

  it('updates for add, remove and accent changes', () => {
    const one = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: [member('a', 'sky')] }))
    const two = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: [member('a', 'sky'), member('b', 'honey')] }))
    const recolored = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: [member('a', 'sage')] }))

    expect(one).toContain('data-member-count="1"')
    expect(two).toContain('data-member-count="2"')
    expect(two).toContain('var(--brand-honey)')
    expect(recolored).toContain('var(--brand-mint)')
    expect(recolored).not.toContain('var(--brand-blue)')
  })

  it.each([1, 2, 3, 4, 5, 8, 12])('gives each of %i members one shape without overflow badges', (count) => {
    const family = Array.from({ length: count }, (_, index) => member(`member-${index}`, 'sky'))
    const html = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: family }))

    expect(countShapes(html)).toBe(count)
    expect(html).toContain(`data-member-count="${count}"`)
    expect(html).not.toContain('family-mark-overflow')
    expect(html).not.toMatch(/>\+\d+</)
  })

  it('renders the same markup for the same family on every reload', () => {
    const family = [member('b', 'coral'), member('a', 'sage')]
    const first = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: family }))
    const second = renderToStaticMarkup(createElement(FamilyMark, { variant: 'dynamic', members: [...family].reverse() }))
    expect(first).toBe(second)
  })

  it('uses a neutral placeholder without stale colors while loading', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, {
      variant: 'dynamic', members: [member('a', 'sage')], loading: true,
    }))
    expect(html).toContain('is-loading')
    expect(html).not.toContain('var(--brand-mint)')
    expect(html).not.toContain('data-member-count')
  })

  it.each(supportedSizes)('preserves the same geometry and aspect ratio at %i px', (size) => {
    const html = renderToStaticMarkup(createElement(FamilyMark, { variant: 'static', size }))
    expect(html).toContain(`width="${size}"`)
    expect(html).toContain(`height="${size}"`)
    expect(html).toContain('viewBox="0 0 64 64"')
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(html).toContain('shape-rendering="geometricPrecision"')
    expect(countShapes(html)).toBe(3)
  })

  it('keeps the stable variant on the landing page three-shape mark', () => {
    const html = renderToStaticMarkup(createElement(FamilyMark, { variant: 'static' }))
    expect(html).toContain('#e9785e')
    expect(html).toContain('#f2c85b')
    expect(html).toContain('#8bc6ad')
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
})

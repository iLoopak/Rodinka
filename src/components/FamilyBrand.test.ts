import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeFamilyMember } from '../utils/testFixtures'
import { FamilyBrand } from './FamilyBrand'

const firstMember = makeFamilyMember({ id: 'member-a', color_key: 'blue' })
const secondMember = makeFamilyMember({ id: 'member-b', color_key: 'honey' })

describe('FamilyBrand', () => {
  it('renders the product and active household as one accessible lockup', () => {
    const html = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Novákovi', members: [firstMember, secondMember] }))
    expect(html).toContain('aria-label="Rodinka Novákovi"')
    expect(html).toContain('class="wordmark">Rodinka</span>')
    expect(html).toContain('title="Novákovi">Novákovi</span>')
    expect(html).toContain('data-member-count="2"')
    expect(html).toContain('#8DB9C7')
    expect(html).toContain('#F2C85B')
  })

  it('updates naturally when a different active family is rendered', () => {
    const first = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Novákovi', members: [firstMember] }))
    const second = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Svobodovi', members: [secondMember] }))
    expect(first).toContain('Novákovi')
    expect(second).toContain('Svobodovi')
    expect(second).not.toContain('Novákovi')
    expect(first).toContain('#8DB9C7')
    expect(second).toContain('#F2C85B')
    expect(second).not.toContain('#8DB9C7')
  })

  it('shows only the product while loading or when the family name is unusable', () => {
    const loading = renderToStaticMarkup(createElement(FamilyBrand, {
      familyName: 'Previous family', members: [firstMember], loading: true,
    }))
    const duplicate = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Rodinka', members: [firstMember] }))
    expect(loading).toContain('aria-label="Rodinka"')
    expect(loading).not.toContain('Previous family')
    expect(loading).not.toContain('var(--brand-blue)')
    expect(loading).not.toContain('data-member-count')
    expect(duplicate.match(/Rodinka/g)).toHaveLength(2) // aria-label plus visible wordmark
  })

  it('keeps the current household text stable while only member colors refresh', () => {
    const html = renderToStaticMarkup(createElement(FamilyBrand, {
      familyName: 'Novákovi', members: [firstMember], markLoading: true,
    }))
    expect(html).toContain('aria-label="Rodinka Novákovi"')
    expect(html).toContain('Novákovi</span>')
    expect(html).not.toContain('var(--brand-blue)')
  })
})

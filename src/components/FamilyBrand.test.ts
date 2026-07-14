import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FamilyBrand } from './FamilyBrand'

describe('FamilyBrand', () => {
  it('renders the product and active household as one accessible lockup', () => {
    const html = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Novákovi' }))
    expect(html).toContain('aria-label="Rodinka Novákovi"')
    expect(html).toContain('class="wordmark">Rodinka</span>')
    expect(html).toContain('title="Novákovi">Novákovi</span>')
  })

  it('updates naturally when a different active family is rendered', () => {
    const first = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Novákovi' }))
    const second = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Svobodovi' }))
    expect(first).toContain('Novákovi')
    expect(second).toContain('Svobodovi')
    expect(second).not.toContain('Novákovi')
  })

  it('shows only the product while loading or when the family name is unusable', () => {
    const loading = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Previous family', loading: true }))
    const duplicate = renderToStaticMarkup(createElement(FamilyBrand, { familyName: 'Rodinka' }))
    expect(loading).toContain('aria-label="Rodinka"')
    expect(loading).not.toContain('Previous family')
    expect(duplicate.match(/Rodinka/g)).toHaveLength(2) // aria-label plus visible wordmark
  })
})

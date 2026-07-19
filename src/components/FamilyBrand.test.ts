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

  it('passes member focus to the mark while keeping the text lockup unchanged', () => {
    const html = renderToStaticMarkup(createElement(FamilyBrand, {
      familyName: 'Novákovi',
      members: [firstMember, secondMember],
      activeMemberId: secondMember.id,
      animationMode: 'member-focus',
    }))
    expect(html).toContain(`data-member-id="${secondMember.id}"`)
    expect(html).toContain('data-active-member="true"')
    expect(html).toContain('data-animation-mode="member-focus"')
    expect(html).toContain('class="brand-lockup family-brand-lockup"')
  })

  it('makes only the dynamic mark interactive when opening the game', () => {
    const html = renderToStaticMarkup(createElement(FamilyBrand, {
      familyName: 'Novákovi',
      members: [firstMember, secondMember],
      onOpenGame: () => undefined,
      openGameLabel: 'Otevřít Rodinka Jump',
    }))
    const buttonStart = html.indexOf('<button')
    const buttonEnd = html.indexOf('</button>')
    const lockupStart = html.indexOf('class="brand-lockup family-brand-lockup"')
    expect(html).toContain('class="family-brand-game-button"')
    expect(html).toContain('aria-label="Otevřít Rodinka Jump"')
    expect(buttonStart).toBeGreaterThan(-1)
    expect(buttonEnd).toBeGreaterThan(buttonStart)
    expect(lockupStart).toBeGreaterThan(buttonEnd)
    expect(html.slice(buttonStart, buttonEnd)).not.toContain('wordmark')
  })
})

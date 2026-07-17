// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilterDisclosure, FilterDisclosurePanel, FilterDisclosureToggle } from './FilterDisclosure'
import { changeLanguage } from '../../i18n'

function renderDisclosure(props: Partial<Parameters<typeof FilterDisclosure>[0]>, panelChild = createElement('input')) {
  return render(createElement(FilterDisclosure, { id: 'filters', open: false, onOpenChange: vi.fn(), activeCount: 0, onClear: vi.fn(), ...props },
    createElement('header', null, createElement(FilterDisclosureToggle)),
    createElement(FilterDisclosurePanel, null, panelChild)))
}

describe('FilterDisclosure', () => {
  beforeEach(async () => { await changeLanguage('cs') })
  afterEach(cleanup)
  it('exposes active filters and resets them without opening the panel', () => {
    const onClear = vi.fn()
    renderDisclosure({ activeCount: 2, onClear }, createElement('select', { 'aria-label': 'Person' }, createElement('option', null, 'All')))
    expect(screen.getByRole('status').textContent).toContain('Aktivní filtry: 2')
    expect(screen.getByRole('region', { hidden: true }).hasAttribute('hidden')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit filtry' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('uses accessible disclosure state and closes on Escape', () => {
    const onOpenChange = vi.fn()
    renderDisclosure({ open: true, onOpenChange })
    expect(screen.getByRole('button', { name: 'Skrýt filtry' }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders the toggle where it is mounted, not next to the panel', () => {
    const { container } = renderDisclosure({})
    const toggle = screen.getByRole('button', { name: 'Zobrazit filtry' })
    expect(toggle.closest('header')).not.toBeNull()
    expect(toggle.getAttribute('aria-controls')).toBe('filters')
    expect(toggle.getAttribute('title')).toBe('Zobrazit filtry')
    expect(container.querySelector('.filter-disclosure')?.contains(toggle)).toBe(false)
  })
})

// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FormField, type FieldControlProps } from './components/ui/FormField'
import { StickyActionFooter } from './components/ui/StickyActionFooter'

afterEach(cleanup)

describe('FormField wiring', () => {
  it('associates the label with the control by id', () => {
    const { container } = render(
      createElement(FormField, { ...{ label: 'Email' }, children: (field: FieldControlProps) => createElement('input', { ...field }) }),
    )
    const label = container.querySelector('label')!
    const input = container.querySelector('input')!
    expect(input.id).toBeTruthy()
    expect(label.getAttribute('for')).toBe(input.id)
  })

  it('links a hint through aria-describedby', () => {
    const { container } = render(
      createElement(FormField, { ...{ label: 'Email', hint: 'We only use it to sign in' }, children: (field: FieldControlProps) => createElement('input', { ...field }) }),
    )
    const input = container.querySelector('input')!
    const hint = container.querySelector('.field-hint')!
    expect(hint.id).toBeTruthy()
    expect(input.getAttribute('aria-describedby')).toContain(hint.id)
  })

  it('marks the control invalid and links the error when one is set', () => {
    const { container } = render(
      createElement(FormField, { ...{ label: 'Email', error: 'That address is taken' }, children: (field: FieldControlProps) => createElement('input', { ...field }) }),
    )
    const input = container.querySelector('input')!
    const error = container.querySelector('.field-error')!
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(error.getAttribute('role')).toBe('alert')
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
  })

  it('keeps the label accessible name clean when required', () => {
    // The required marker is a CSS ::after, so the name stays exactly the
    // label and getByLabelText still finds it.
    const { container } = render(
      createElement(FormField, { ...{ label: 'Email', required: true }, children: (field: FieldControlProps) => createElement('input', { ...field }) }),
    )
    const label = container.querySelector('label')!
    expect(label.textContent).toBe('Email')
    expect(container.querySelector('input')!.getAttribute('aria-required')).toBe('true')
  })

  it('does not describe the control when it has neither hint nor error', () => {
    const { container } = render(
      createElement(FormField, { ...{ label: 'Email' }, children: (field: FieldControlProps) => createElement('input', { ...field }) }),
    )
    expect(container.querySelector('input')!.getAttribute('aria-describedby')).toBeNull()
  })
})

describe('StickyActionFooter', () => {
  it('renders a submit and a cancel action', () => {
    const { container } = render(
      createElement(StickyActionFooter, { submitLabel: 'Save', cancelLabel: 'Cancel', onCancel: () => {} }),
    )
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent)
    expect(buttons).toContain('Save')
    expect(buttons).toContain('Cancel')
  })

  it('disables the submit and shows busy while loading', () => {
    const { container } = render(
      createElement(StickyActionFooter, { submitLabel: 'Save', loading: true }),
    )
    const submit = container.querySelector('.btn-primary')!
    expect(submit.hasAttribute('disabled')).toBe(true)
    expect(submit.getAttribute('aria-busy')).toBe('true')
  })

  it('keeps a destructive action apart from the confirm pair', () => {
    const { container } = render(
      createElement(StickyActionFooter, {
        submitLabel: 'Save',
        destructive: { label: 'Delete', onClick: () => {} },
      }),
    )
    const destructive = container.querySelector('.sticky-action-destructive')!
    expect(destructive.textContent).toBe('Delete')
    // It sits outside the primary group so muscle memory for Save cannot hit it.
    expect(destructive.closest('.sticky-action-primary-group')).toBeNull()
  })
})

describe('primitive CSS is real', () => {
  it('gives the sticky footer safe-area bottom padding', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const css = readFileSync(join(process.cwd(), 'src/styles/primitives/form.css'), 'utf8')
    // The confirm action has to clear the iOS home indicator.
    expect(css).toMatch(/\.sticky-action-footer[\s\S]*env\(safe-area-inset-bottom\)/)
  })

  it('reserves clearance below whatever sits directly above the sticky footer', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const css = readFileSync(join(process.cwd(), 'src/styles/primitives/form.css'), 'utf8')
    // `position: sticky` plus the footer's own bottom-edge-alignment trick
    // means a plain scroll-to-bottom does not naturally clear the footer of
    // the field above it (confirmed by direct measurement, not just reading
    // the rule) — without this, that field ends up partly hidden behind the
    // footer once a sheet has to scroll at all.
    expect(css).toMatch(/\*:has\(\+ \.sticky-action-footer\)\s*\{[^}]*margin-bottom:/)
  })
})

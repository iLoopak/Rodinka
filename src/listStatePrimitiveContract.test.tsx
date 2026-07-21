// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Card, InteractiveCard } from './components/ui/Card'
import { ListRow, NavigationRow, SelectableRow } from './components/ui/ListRow'
import { StatusPill } from './components/ui/StatusPill'
import { StateView } from './components/ui/StateView'

afterEach(cleanup)

describe('StatusPill', () => {
  it('always carries a text label, not colour alone', () => {
    const { container } = render(<StatusPill tone="danger">Overdue</StatusPill>)
    const pill = container.querySelector('.status-pill')!
    expect(pill.classList.contains('status-pill--danger')).toBe(true)
    expect(pill.querySelector('.status-pill__label')!.textContent).toBe('Overdue')
    // The glyph is a second, non-colour channel.
    expect(pill.querySelector('svg')).not.toBeNull()
  })

  it('can drop the icon deliberately with icon={null}', () => {
    const { container } = render(<StatusPill icon={null}>Draft</StatusPill>)
    expect(container.querySelector('.status-pill svg')).toBeNull()
    expect(container.querySelector('.status-pill__label')!.textContent).toBe('Draft')
  })
})

describe('ListRow composition', () => {
  it('renders every slot in its place', () => {
    const { container } = render(
      <ListRow leading={<i data-testid="lead" />} title="Title" meta="Meta" description="Desc" trailing={<b data-testid="trail" />} />,
    )
    expect(container.querySelector('.list-row__leading [data-testid="lead"]')).not.toBeNull()
    expect(container.querySelector('.list-row__title')!.textContent).toBe('Title')
    expect(container.querySelector('.list-row__meta')!.textContent).toBe('Meta')
    expect(container.querySelector('.list-row__description')!.textContent).toBe('Desc')
    expect(container.querySelector('.list-row__trailing [data-testid="trail"]')).not.toBeNull()
  })

  it('is a plain div — not a control — so it can host inner buttons', () => {
    const { container } = render(<ListRow title="x" />)
    expect(container.querySelector('.list-row')!.tagName).toBe('DIV')
  })
})

describe('NavigationRow', () => {
  it('renders a real button so keyboard activation is native', () => {
    const onClick = vi.fn()
    const { container } = render(<NavigationRow title="Settings" onClick={onClick} />)
    const row = container.querySelector('.list-row--navigation')!
    expect(row.tagName).toBe('BUTTON')
    expect(row.querySelector('.list-row__chevron')).not.toBeNull()
    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders an anchor when given an href', () => {
    const { container } = render(<NavigationRow title="Docs" href="/docs" />)
    const row = container.querySelector('.list-row--navigation')!
    expect(row.tagName).toBe('A')
    expect(row.getAttribute('href')).toBe('/docs')
  })

  it('disables activation when disabled', () => {
    const onClick = vi.fn()
    const { container } = render(<NavigationRow title="x" disabled onClick={onClick} />)
    const row = container.querySelector('button')!
    expect(row.disabled).toBe(true)
    fireEvent.click(row)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('SelectableRow', () => {
  it('exposes selection through aria-pressed, not colour alone', () => {
    const { container, rerender } = render(<SelectableRow title="Pick me" selected={false} />)
    const row = container.querySelector('.list-row--selectable')!
    expect(row.tagName).toBe('BUTTON')
    expect(row.getAttribute('aria-pressed')).toBe('false')
    rerender(<SelectableRow title="Pick me" selected />)
    expect(container.querySelector('.list-row--selectable')!.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Card', () => {
  it('maps variants to modifier classes', () => {
    const { container } = render(<Card variant="danger">x</Card>)
    expect(container.querySelector('.card')!.classList.contains('card--danger')).toBe(true)
  })

  it('InteractiveCard is a button and reflects selection with aria-pressed', () => {
    const { container } = render(<InteractiveCard selected>x</InteractiveCard>)
    const card = container.querySelector('.card--interactive')!
    expect(card.tagName).toBe('BUTTON')
    expect(card.classList.contains('card--selected')).toBe(true)
    expect(card.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('StateView differentiation', () => {
  // The whole point of the wave: these four must not collapse into one look.
  it('gives offline, degraded, permission and error distinct tone + variant classes', () => {
    const variants = ['offline', 'degraded', 'permissionDenied', 'error'] as const
    const tones = variants.map((variant) => {
      const { container } = render(<StateView variant={variant} />)
      const el = container.querySelector('.state-view')!
      cleanup()
      return el.className
    })
    // Each rendered a different set of classes.
    expect(new Set(tones).size).toBe(variants.length)
  })

  it('announces an error assertively but offline politely', () => {
    const { container: err } = render(<StateView variant="error" description="boom" />)
    expect(err.querySelector('.state-view')!.getAttribute('role')).toBe('alert')
    cleanup()
    const { container: off } = render(<StateView variant="offline" />)
    const offline = off.querySelector('.state-view')!
    expect(offline.getAttribute('role')).toBe('status')
    // Offline uses a different glyph than permission-denied.
    expect(offline.classList.contains('state-view--offline')).toBe(true)
  })

  it('renders end-of-list quietly with no action', () => {
    const { container } = render(<StateView variant="endOfList" />)
    expect(container.querySelector('.state-view--endOfList')).not.toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })
})

describe('StateView action', () => {
  it('runs the action and prevents a double submit while pending', async () => {
    let resolve!: () => void
    const onClick = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    const { container } = render(
      <StateView variant="error" action={{ label: 'Retry', onClick }} />,
    )
    const button = container.querySelector('button')!
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button.hasAttribute('disabled')).toBe(true)
    resolve()
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  })

  it('shows a dev-only technical detail (dev build in tests)', () => {
    const { container } = render(
      <StateView variant="error" description="user copy" technicalDetail="stack trace 0xdead" />,
    )
    expect(container.querySelector('.state-view__technical')!.textContent).toContain('stack trace')
  })
})

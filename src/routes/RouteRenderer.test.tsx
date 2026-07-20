// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ComponentType } from 'react'
import { RouteRenderer } from './RouteRenderer'
import type { RouteDefinition } from './routeRegistry'

afterEach(cleanup)

describe('RouteRenderer', () => {
  it('shows the accessible shared fallback until the lazy screen resolves', async () => {
    let resolveScreen!: (module: { default: ComponentType }) => void
    const load = () => new Promise<{ default: ComponentType }>((resolve) => { resolveScreen = resolve })
    const definition: RouteDefinition = {
      path: '/messages',
      load,
      offline: 'blocked',
      shell: 'standard',
      access: 'all-members',
      fallback: '/',
    }

    render(<RouteRenderer definition={definition} />)

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    await act(async () => resolveScreen({ default: () => <div>Lazy messages screen</div> }))
    expect(await screen.findByText('Lazy messages screen')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses a viewport-sized fallback for fullscreen routes', () => {
    const definition: RouteDefinition = {
      path: '/family-jump',
      load: () => new Promise(() => undefined),
      offline: 'available',
      shell: 'fullscreen',
      access: 'all-members',
      fallback: '/',
    }

    render(<RouteRenderer definition={definition} />)
    expect(screen.getByRole('status').classList.contains('is-fullscreen')).toBe(true)
  })
})

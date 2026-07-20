// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ComponentType } from 'react'
import { AppRouteOutlet } from './AppShell'
import type { RouteDefinition } from '../routes/routeRegistry'

afterEach(cleanup)

describe('AppRouteOutlet', () => {
  it('renders a fullscreen route without the standard AppShell', async () => {
    let resolveScreen!: (module: { default: ComponentType }) => void
    const definition: RouteDefinition = {
      path: '/family-jump',
      load: () => new Promise((resolve) => { resolveScreen = resolve }),
      offline: 'available',
      shell: 'fullscreen',
      access: 'all-members',
      fallback: '/',
    }

    const view = render(<AppRouteOutlet definition={definition} />)
    expect(view.container.querySelector('.app-shell')).toBeNull()

    await act(async () => resolveScreen({ default: () => <main>Family Jump loaded</main> }))
    expect(await screen.findByText('Family Jump loaded')).toBeTruthy()
    expect(view.container.querySelector('.app-shell')).toBeNull()
  })
})

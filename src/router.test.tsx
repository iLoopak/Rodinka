// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeRoute, ROUTES, RouterProvider, useRouter } from './router'

function RouterProbe() {
  const { path, searchParams, navigateHref } = useRouter()
  return (
    <div>
      <output data-testid="path">{path}</output>
      <output data-testid="conversation">{searchParams.get('conversation') ?? ''}</output>
      <output data-testid="reminder">{searchParams.get('reminder') ?? ''}</output>
      <button type="button" onClick={() => navigateHref('/messages?conversation=family-42#latest')}>Open message</button>
      <button type="button" onClick={() => navigateHref('/reminders?reminder=due-7#detail')}>Open reminder</button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('lightweight router contracts', () => {
  it('normalizes unknown URLs to home', () => {
    expect(normalizeRoute('/not-a-route')).toBe('/')
  })

  it.each(ROUTES)('supports a direct refresh on %s', (route) => {
    window.history.replaceState(null, '', `${route}?source=refresh#section`)
    const view = render(<RouterProvider><RouterProbe /></RouterProvider>)
    expect(screen.getByTestId('path').textContent).toBe(route)
    expect(window.location.search).toBe('?source=refresh')
    expect(window.location.hash).toBe('#section')
    view.unmount()
  })

  it('opens a pushed message deep link without losing query or hash', () => {
    render(<RouterProvider><RouterProbe /></RouterProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Open message' }))
    expect(screen.getByTestId('path').textContent).toBe('/messages')
    expect(screen.getByTestId('conversation').textContent).toBe('family-42')
    expect(window.location.hash).toBe('#latest')
  })

  it('opens a reminder deep link without losing query or hash', () => {
    render(<RouterProvider><RouterProbe /></RouterProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Open reminder' }))
    expect(screen.getByTestId('path').textContent).toBe('/reminders')
    expect(screen.getByTestId('reminder').textContent).toBe('due-7')
    expect(window.location.hash).toBe('#detail')
  })

  it('responds to browser history popstate changes', () => {
    render(<RouterProvider><RouterProbe /></RouterProvider>)
    act(() => {
      window.history.pushState(null, '', '/meals?day=monday#dinner')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('path').textContent).toBe('/meals')
    expect(window.location.search).toBe('?day=monday')
    expect(window.location.hash).toBe('#dinner')
  })
})

// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  RouterProvider,
  useRoutePath,
  useRouteSearchParams,
  useRouterActions,
} from './router'

// Wave 7: the router used to publish one inline object, so opening a
// conversation (`?c=`) re-rendered every component that only wanted to
// navigate. These counts are the reason the context was split in three.

const renders = { path: 0, search: 0, actions: 0 }

function PathConsumer() {
  renders.path += 1
  return <span data-testid="path">{useRoutePath()}</span>
}

function SearchConsumer() {
  renders.search += 1
  return <span data-testid="search">{useRouteSearchParams().get('c') ?? 'none'}</span>
}

function ActionsConsumer() {
  renders.actions += 1
  const { navigate, setQueryParam } = useRouterActions()
  return (
    <>
      <button type="button" data-testid="go" onClick={() => navigate('/shopping')}>go</button>
      <button type="button" data-testid="query" onClick={() => setQueryParam('c', 'conv-1')}>query</button>
    </>
  )
}

function Tree() {
  return (
    <RouterProvider>
      <PathConsumer />
      <SearchConsumer />
      <ActionsConsumer />
    </RouterProvider>
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  renders.path = 0
  renders.search = 0
  renders.actions = 0
})

afterEach(cleanup)

describe('router render boundaries', () => {
  it('does not re-render navigation-only consumers when a query parameter changes', () => {
    render(<Tree />)
    const actionsBefore = renders.actions
    const pathBefore = renders.path

    act(() => { screen.getByTestId('query').click() })

    expect(screen.getByTestId('search').textContent).toBe('conv-1')
    // Opening a chat is the real-world case: it must not touch the bottom
    // navigation or anything else that only holds an action.
    expect(renders.actions).toBe(actionsBefore)
    expect(renders.path).toBe(pathBefore)
  })

  it('does not re-render query-parameter consumers on plain navigation', () => {
    render(<Tree />)
    const searchBefore = renders.search
    const actionsBefore = renders.actions

    act(() => { screen.getByTestId('go').click() })

    expect(screen.getByTestId('path').textContent).toBe('/shopping')
    expect(renders.search).toBe(searchBefore)
    expect(renders.actions).toBe(actionsBefore)
  })

  it('keeps the actions object referentially stable for the provider lifetime', () => {
    const seen: unknown[] = []
    function ActionsIdentity() {
      seen.push(useRouterActions())
      return null
    }
    render(
      <RouterProvider>
        <ActionsIdentity />
        <ActionsConsumer />
      </RouterProvider>,
    )
    act(() => { screen.getByTestId('go').click() })
    act(() => { screen.getByTestId('query').click() })

    expect(seen.length).toBeGreaterThan(0)
    expect(new Set(seen).size).toBe(1)
  })

  it('still delivers path and search updates to the consumers that want them', () => {
    render(<Tree />)
    act(() => { screen.getByTestId('go').click() })
    expect(screen.getByTestId('path').textContent).toBe('/shopping')
    act(() => { screen.getByTestId('query').click() })
    expect(screen.getByTestId('search').textContent).toBe('conv-1')
  })

  it('follows browser back through popstate', () => {
    render(<Tree />)
    act(() => { screen.getByTestId('go').click() })
    expect(screen.getByTestId('path').textContent).toBe('/shopping')

    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('path').textContent).toBe('/')
  })
})

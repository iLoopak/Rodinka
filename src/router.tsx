import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'
import { updateUrlQuery, type QueryHistoryMode } from './utils/deepLinks'

// Minimal client-side router for a fixed set of top-level destinations.
// No dependency needed: pushState/popstate covers back/forward, no-reload
// navigation, and reading window.location on mount covers direct refresh.

export const ROUTES = ['/', '/calendar', '/plan', '/chores', '/activities', '/health', '/meals', '/shopping', '/family', '/messages', '/more', '/reminders', '/arcade', '/arcade/family-jump', '/arcade/family-fleet', '/family-jump'] as const
export type Route = (typeof ROUTES)[number]

export function normalizeRoute(pathname: string): Route {
  return (ROUTES as readonly string[]).includes(pathname) ? (pathname as Route) : '/'
}

export interface RouterActions {
  navigate: (to: Route, hash?: string) => void
  navigateHref: (href: string) => void
  setQueryParam: (name: string, value: string, mode?: QueryHistoryMode) => void
  removeQueryParam: (name: string, mode?: QueryHistoryMode) => void
}

interface RouterContextValue extends RouterActions {
  path: Route
  searchParams: URLSearchParams
}

// Three contexts, because the three change at completely different rates:
// `path` on navigation, `searchParams` on things like opening a conversation
// (`?c=`), and the actions never — every one is a useCallback keyed on a
// stable dependency. A component that only navigates has no business
// re-rendering because a query parameter moved.
const RoutePathContext = createContext<Route | null>(null)
const RouteSearchContext = createContext<URLSearchParams | null>(null)
const RouterActionsContext = createContext<RouterActions | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<Route>(() => normalizeRoute(window.location.pathname))
  const [search, setSearch] = useState(() => window.location.search)

  const syncLocation = useCallback(() => {
    setPath(normalizeRoute(window.location.pathname))
    setSearch(window.location.search)
  }, [])

  useEffect(() => {
    function onPopState() { syncLocation() }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [syncLocation])

  const navigate = useCallback((to: Route, hash?: string) => {
    const target = hash ? `${to}${hash}` : to
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== target) {
      window.history.pushState(null, '', target)
    }
    syncLocation()
  }, [syncLocation])

  const navigateHref = useCallback((href: string) => {
    const target = new URL(href, window.location.origin)
    const safePath = normalizeRoute(target.pathname)
    const next = `${safePath}${target.search}${target.hash}`
    window.history.pushState(null, '', next)
    syncLocation()
  }, [syncLocation])

  const changeQueryParam = useCallback((name: string, value: string | null, mode: QueryHistoryMode) => {
    const target = updateUrlQuery(window.location.href, name, value)
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', target)
    syncLocation()
  }, [syncLocation])

  const setQueryParam = useCallback((name: string, value: string, mode: QueryHistoryMode = 'push') => {
    changeQueryParam(name, value, mode)
  }, [changeQueryParam])

  const removeQueryParam = useCallback((name: string, mode: QueryHistoryMode = 'replace') => {
    changeQueryParam(name, null, mode)
  }, [changeQueryParam])

  const searchParams = useMemo(() => new URLSearchParams(search), [search])

  // Stable for the provider's whole lifetime: every callback below is keyed on
  // `syncLocation`, which is itself keyed on nothing.
  const actions = useMemo<RouterActions>(
    () => ({ navigate, navigateHref, setQueryParam, removeQueryParam }),
    [navigate, navigateHref, setQueryParam, removeQueryParam],
  )

  return (
    <RouterActionsContext.Provider value={actions}>
      <RouteSearchContext.Provider value={searchParams}>
        <RoutePathContext.Provider value={path}>{children}</RoutePathContext.Provider>
      </RouteSearchContext.Provider>
    </RouterActionsContext.Provider>
  )
}

export function useRoutePath(): Route {
  const path = useContext(RoutePathContext)
  if (path === null) throw new Error('useRoutePath must be used within a RouterProvider')
  return path
}

export function useRouteSearchParams(): URLSearchParams {
  const searchParams = useContext(RouteSearchContext)
  if (!searchParams) throw new Error('useRouteSearchParams must be used within a RouterProvider')
  return searchParams
}

export function useRouterActions(): RouterActions {
  const actions = useContext(RouterActionsContext)
  if (!actions) throw new Error('useRouterActions must be used within a RouterProvider')
  return actions
}

// Compatibility facade for the handful of components that genuinely need all
// three. Prefer the narrow hooks above: this one re-renders on any routing
// change by definition.
export function useRouter(): RouterContextValue {
  const path = useRoutePath()
  const searchParams = useRouteSearchParams()
  const actions = useRouterActions()
  return useMemo(() => ({ path, searchParams, ...actions }), [path, searchParams, actions])
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route
  hash?: string
}

export function Link({ to, hash, children, onClick, ...rest }: LinkProps) {
  const path = useRoutePath()
  const { navigate } = useRouterActions()
  const href = hash ? `${to}${hash}` : to

  return (
    <a
      href={href}
      aria-current={path === to ? 'page' : undefined}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        e.preventDefault()
        navigate(to, hash)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

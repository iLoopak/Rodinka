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

export const ROUTES = ['/', '/calendar', '/plan', '/chores', '/activities', '/health', '/meals', '/shopping', '/family', '/messages', '/more', '/reminders', '/family-jump'] as const
export type Route = (typeof ROUTES)[number]

function normalize(pathname: string): Route {
  return (ROUTES as readonly string[]).includes(pathname) ? (pathname as Route) : '/'
}

interface RouterContextValue {
  path: Route
  searchParams: URLSearchParams
  navigate: (to: Route, hash?: string) => void
  navigateHref: (href: string) => void
  setQueryParam: (name: string, value: string, mode?: QueryHistoryMode) => void
  removeQueryParam: (name: string, mode?: QueryHistoryMode) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<Route>(() => normalize(window.location.pathname))
  const [search, setSearch] = useState(() => window.location.search)

  const syncLocation = useCallback(() => {
    setPath(normalize(window.location.pathname))
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
    const safePath = normalize(target.pathname)
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

  return <RouterContext.Provider value={{ path, searchParams, navigate, navigateHref, setQueryParam, removeQueryParam }}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used within a RouterProvider')
  return ctx
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route
  hash?: string
}

export function Link({ to, hash, children, onClick, ...rest }: LinkProps) {
  const { path, navigate } = useRouter()
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

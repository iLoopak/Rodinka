import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'

// Minimal client-side router for a fixed set of top-level destinations.
// No dependency needed: pushState/popstate covers back/forward, no-reload
// navigation, and reading window.location on mount covers direct refresh.

export const ROUTES = ['/', '/chores', '/family', '/more'] as const
export type Route = (typeof ROUTES)[number]

function normalize(pathname: string): Route {
  return (ROUTES as readonly string[]).includes(pathname) ? (pathname as Route) : '/'
}

interface RouterContextValue {
  path: Route
  navigate: (to: Route) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<Route>(() => normalize(window.location.pathname))

  useEffect(() => {
    function onPopState() {
      setPath(normalize(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: Route) => {
    if (window.location.pathname !== to) {
      window.history.pushState(null, '', to)
    }
    setPath(to)
  }, [])

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>
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
        if (hash) window.history.replaceState(null, '', href)
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

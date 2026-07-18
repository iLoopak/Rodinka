import { useEffect, useState } from 'react'

// Small subscription to a CSS media query. Used to decide, in JS, whether
// the messaging surface should render its conversation detail as a
// portaled mobile fullscreen overlay or as the desktop second column.
// SSR-safe default of `false` — this app is a CSR PWA so the effect runs
// on mount and corrects immediately.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    // addEventListener('change') is supported by every browser this app
    // targets; the older addListener fallback isn't needed.
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// The one breakpoint the messaging fullscreen logic keys on. Kept in sync
// with the `@media (max-width: 720px)` boundary in index.css so the JS
// portal decision and the CSS layout never disagree.
export const MOBILE_CHAT_QUERY = '(max-width: 720px)'

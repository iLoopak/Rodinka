import type { ReactNode } from 'react'
import { Link, useRouter, type Route } from '../router'
import { t } from '../strings'
import { isNavigationItemActive } from '../utils/navigation'

interface NavigationItem {
  to: Route
  label: () => string
  activeRoutes?: readonly Route[]
  icon: (active: boolean) => ReactNode
}

const items: NavigationItem[] = [
  {
    to: '/',
    label: () => t.nav.today,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5h3.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/calendar',
    label: () => t.nav.calendar,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="5" width="16" height="15" rx="3" strokeLinejoin="round" />
        <path d="M4 10h16M8 3v4M16 3v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/plan',
    label: () => t.nav.plan,
    activeRoutes: ['/plan', '/chores', '/activities', '/health', '/meals', '/shopping'],
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
        <path d="M8 2v4M16 2v4M7 10h10M7 14h4M14 14h3M7 18h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/family',
    label: () => t.nav.family,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8.5" r="2.75" />
        <circle cx="16" cy="9.5" r="2.25" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
        <path d="M14.5 14.3c2.4.2 4 2 4 4.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/more',
    label: () => t.nav.more,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
]

export function BottomNavigation() {
  const { path } = useRouter()

  return (
    <nav className="bottom-nav" aria-label={t.common.primaryNavigation}>
      {items.map((item) => {
        const active = isNavigationItemActive(item, path)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`bottom-nav-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-nav-icon" aria-hidden="true">{item.icon(active)}</span>
            <span>{item.label()}</span>
          </Link>
        )
      })}
    </nav>
  )
}

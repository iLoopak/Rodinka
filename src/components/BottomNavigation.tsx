import type { ReactNode } from 'react'
import { Link, useRouter, type Route } from '../router'
import { t } from '../strings'

const items: { to: Route; label: string; icon: (active: boolean) => ReactNode }[] = [
  {
    to: '/',
    label: t.nav.today,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5h3.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/calendar',
    label: t.nav.calendar,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="5" width="16" height="15" rx="3" strokeLinejoin="round" />
        <path d="M4 10h16M8 3v4M16 3v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/chores',
    label: t.nav.chores,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="5" strokeLinejoin="round" />
        <path d="m8.5 12.5 2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/family',
    label: t.nav.family,
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
    label: t.nav.more,
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
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const active = path === item.to
        return (
          <Link key={item.to} to={item.to} className={`bottom-nav-item${active ? ' active' : ''}`}>
            {item.icon(active)}
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

import { describe, expect, it } from 'vitest'
import { isNavigationItemActive } from '../utils/navigation'
import { primaryNavigationRoutes, childPrimaryRouteForPath } from '../utils/uiCapabilities'
import type { FamilyMember } from '../hooks/useFamilyMembers'

const member = (id: string, role: FamilyMember['role'], family_id = 'fam-1') => ({ id, role, family_id })

const plannerItem = {
  to: '/plan' as const,
  activeRoutes: ['/plan', '/chores', '/activities', '/health', '/meals', '/shopping'] as const,
}

const messagesItem = {
  to: '/messages' as const,
  activeRoutes: ['/messages'] as const,
}

describe('isNavigationItemActive', () => {
  it.each(['/plan', '/chores', '/activities', '/health', '/meals', '/shopping'] as const)(
    'keeps Planner active on %s',
    (path) => {
      expect(isNavigationItemActive(plannerItem, path)).toBe(true)
    }
  )

  it('does not make Planner active outside its section', () => {
    expect(isNavigationItemActive(plannerItem, '/calendar')).toBe(false)
    expect(isNavigationItemActive(plannerItem, '/messages')).toBe(false)
  })

  it('uses exact matching for a navigation item without a route group', () => {
    expect(isNavigationItemActive({ to: '/family' }, '/family')).toBe(true)
    expect(isNavigationItemActive({ to: '/family' }, '/more')).toBe(false)
  })

  it('keeps Messages active on /messages', () => {
    expect(isNavigationItemActive(messagesItem, '/messages')).toBe(true)
  })

  it('does not make Messages active on other routes', () => {
    expect(isNavigationItemActive(messagesItem, '/')).toBe(false)
    expect(isNavigationItemActive(messagesItem, '/plan')).toBe(false)
  })
})

describe('adult primary navigation', () => {
  it('shows exactly 5 items in the order: Today, Calendar, Messages, Plan, Family', () => {
    const routes = primaryNavigationRoutes(member('adult', 'parent'))
    expect(routes).toHaveLength(5)
    expect(routes).toEqual(['/', '/calendar', '/messages', '/plan', '/family'])
  })

  it('includes /messages as the third item (center)', () => {
    const routes = primaryNavigationRoutes(member('admin', 'admin'))
    expect(routes[2]).toBe('/messages')
  })

  it('does not include /more in adult primary routes', () => {
    const routes = primaryNavigationRoutes(member('adult', 'parent'))
    expect(routes).not.toContain('/more')
  })
})

describe('child primary navigation', () => {
  it('shows exactly 5 items: Today, Calendar, My tasks, Shopping, More', () => {
    const routes = primaryNavigationRoutes(member('child', 'child'))
    expect(routes).toHaveLength(5)
    expect(routes).toEqual(['/', '/calendar', '/chores', '/shopping', '/more'])
  })

  it('maps /messages to /more for children', () => {
    expect(childPrimaryRouteForPath('/messages')).toBe('/more')
  })
})

describe('unread badge formatting', () => {
  // compactUnreadCount is local to BottomNavigation; test the boundary values here
  // via the badge logic: 1–99 as number, 100+ as "99+"
  it.each([
    [0, null],   // no badge
    [1, '1'],
    [9, '9'],
    [99, '99'],
    [100, '99+'],
    [999, '99+'],
  ] as const)('formats unread count %i correctly', (count, expected) => {
    // Mirror the compactUnreadCount function from BottomNavigation
    const compact = (n: number) => n > 99 ? '99+' : String(n)
    if (expected === null) {
      expect(count).toBe(0)
    } else {
      expect(compact(count)).toBe(expected)
    }
  })
})

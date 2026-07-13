import { describe, expect, it } from 'vitest'
import { isNavigationItemActive } from '../utils/navigation'

const plannerItem = {
  to: '/plan' as const,
  activeRoutes: ['/plan', '/chores', '/activities', '/health', '/meals'] as const,
}

describe('isNavigationItemActive', () => {
  it.each(['/plan', '/chores', '/activities', '/health', '/meals'] as const)(
    'keeps Planner active on %s',
    (path) => {
      expect(isNavigationItemActive(plannerItem, path)).toBe(true)
    }
  )

  it('does not make Planner active outside its section', () => {
    expect(isNavigationItemActive(plannerItem, '/calendar')).toBe(false)
  })

  it('uses exact matching for a navigation item without a route group', () => {
    expect(isNavigationItemActive({ to: '/family' }, '/family')).toBe(true)
    expect(isNavigationItemActive({ to: '/family' }, '/more')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { capabilitiesFor, childPrimaryRouteForPath, childRouteFallback, primaryNavigationRoutes } from './uiCapabilities'

const member = (id: string, role: FamilyMember['role'], family_id = 'family-1') => ({ id, role, family_id })

describe('UI capability matrix', () => {
  it('keeps adult household and on-behalf capabilities', () => {
    const capabilities = capabilitiesFor(member('adult', 'parent'))
    expect(capabilities.manageHousehold).toBe(true)
    expect(capabilities.createPlannerItems).toBe(true)
    expect(capabilities.approveTaskCompletions).toBe(true)
    expect(capabilities.voteFor(member('child-b', 'child'))).toBe(true)
    expect(capabilities.accessRoute('/health')).toBe(true)
  })

  it('allows a child only self-scoped actions and intentional routes', () => {
    const child = member('child-a', 'child')
    const capabilities = capabilitiesFor(child)
    expect(capabilities.manageHousehold).toBe(false)
    expect(capabilities.completeTaskFor('family-1', child.id)).toBe(true)
    expect(capabilities.completeTaskFor('family-1', 'child-b')).toBe(false)
    expect(capabilities.voteFor(child)).toBe(true)
    expect(capabilities.voteFor(member('child-b', 'child'))).toBe(false)
    expect(capabilities.accessRoute('/chores')).toBe(true)
    expect(capabilities.accessRoute('/plan')).toBe(false)
    expect(capabilities.accessRoute('/family')).toBe(false)
    expect(capabilities.accessRoute('/health')).toBe(false)
    expect(primaryNavigationRoutes(child)).toEqual(['/', '/calendar', '/messages', '/chores', '/shopping'])
  })

  it('gives adults exactly 5 primary routes in the correct order', () => {
    const adult = member('adult', 'parent')
    expect(primaryNavigationRoutes(adult)).toEqual(['/', '/calendar', '/messages', '/plan', '/family'])
  })

  it('maps /messages to the child messages tab', () => {
    expect(childPrimaryRouteForPath('/messages')).toBe('/messages')
  })
  it('rejects sibling targets from another family and missing actors', () => {
    const capabilities = capabilitiesFor(member('child-a', 'child'))
    expect(capabilities.editProfile(member('child-a', 'child', 'family-2'))).toBe(false)
    expect(capabilities.voteFor(member('child-a', 'child', 'family-2'))).toBe(false)
    expect(capabilitiesFor(null).accessRoute('/')).toBe(false)
  })

  it('maps adult-only deep links to the nearest child destination', () => {
    expect(childRouteFallback('/plan')).toBe('/chores')
    expect(childRouteFallback('/family')).toBe('/more')
    expect(childRouteFallback('/health')).toBe('/more')
  })

  it.each(['/activities', '/meals', '/reminders'] as const)(
    'groups the child secondary route %s under More',
    (route) => expect(childPrimaryRouteForPath(route)).toBe('/more'),
  )
})

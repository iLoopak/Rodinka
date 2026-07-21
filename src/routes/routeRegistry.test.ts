import { describe, expect, it } from 'vitest'
import { ROUTES } from '../router'
import {
  getRouteDefinition,
  ROUTE_REGISTRY,
  routeIsAllowedForRole,
  routeIsAvailableOffline,
} from './routeRegistry'

describe('top-level route registry', () => {
  it('defines every known route exactly once', () => {
    const registeredPaths = ROUTE_REGISTRY.map(({ path }) => path)
    expect(registeredPaths).toHaveLength(new Set(registeredPaths).size)
    expect([...registeredPaths].sort()).toEqual([...ROUTES].sort())
  })

  it('keeps arcade hub in the standard shell while game routes stay fullscreen and offline-ready', () => {
    const hub = getRouteDefinition('/arcade')
    expect(hub.shell).toBe('standard')
    expect(hub.offline).toBe('available')
    expect(hub.access).toBe('all-members')

    for (const path of ['/arcade/family-jump', '/arcade/family-fleet', '/arcade/family-fleet/hangar', '/family-jump'] as const) {
      const route = getRouteDefinition(path)
      expect(route.shell).toBe('fullscreen')
      expect(route.offline).toBe('available')
      expect(route.access).toBe('all-members')
    }
  })

  it('keeps only the intended startup routes available offline', () => {
    const available = ROUTE_REGISTRY.filter(({ path }) => routeIsAvailableOffline(path)).map(({ path }) => path)
    expect(available).toEqual(['/', '/calendar', '/shopping', '/arcade', '/arcade/family-jump', '/arcade/family-fleet', '/arcade/family-fleet/hangar', '/family-jump'])
  })

  it('preserves adult-only access and child fallbacks', () => {
    expect(routeIsAllowedForRole('/plan', 'child')).toBe(false)
    expect(routeIsAllowedForRole('/health', 'child')).toBe(false)
    expect(routeIsAllowedForRole('/family', 'child')).toBe(false)
    expect(routeIsAllowedForRole('/messages', 'child')).toBe(true)
    expect(routeIsAllowedForRole('/plan', 'parent')).toBe(true)
    expect(routeIsAllowedForRole('/', null)).toBe(false)
    expect(getRouteDefinition('/plan').fallback).toBe('/chores')
    expect(getRouteDefinition('/health').fallback).toBe('/more')
    expect(getRouteDefinition('/family').fallback).toBe('/more')
  })

  it('declares every screen behind a lazy loader', () => {
    for (const definition of ROUTE_REGISTRY) expect(definition.load).toEqual(expect.any(Function))
  })
})

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

  it('keeps Family Jump fullscreen and available offline', () => {
    const jump = getRouteDefinition('/family-jump')
    expect(jump.shell).toBe('fullscreen')
    expect(jump.offline).toBe('available')
    expect(jump.access).toBe('all-members')
  })

  it('keeps only the intended startup routes available offline', () => {
    const available = ROUTE_REGISTRY.filter(({ path }) => routeIsAvailableOffline(path)).map(({ path }) => path)
    expect(available).toEqual(['/', '/calendar', '/shopping', '/family-jump'])
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

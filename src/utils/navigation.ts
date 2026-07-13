import type { Route } from '../router'

export interface NavigationRouteGroup {
  to: Route
  activeRoutes?: readonly Route[]
}

export function isNavigationItemActive(item: NavigationRouteGroup, path: Route) {
  return item.activeRoutes?.includes(path) ?? path === item.to
}

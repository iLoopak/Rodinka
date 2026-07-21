import type { ComponentType } from 'react'
import type { Route } from '../router'

export type RouteOfflinePolicy = 'available' | 'blocked'
export type RouteShell = 'standard' | 'fullscreen'
export type RouteAccess = 'all-members' | 'adults'

export interface RouteDefinition {
  path: Route
  load: () => Promise<{ default: ComponentType }>
  offline: RouteOfflinePolicy
  shell: RouteShell
  access: RouteAccess
  fallback: Route
}

export const ROUTE_REGISTRY = [
  route('/', () => import('../components/TodayDashboard').then(({ TodayDashboard }) => ({ default: TodayDashboard })), 'available'),
  route('/calendar', () => import('../components/CalendarScreen').then(({ CalendarScreen }) => ({ default: CalendarScreen })), 'available'),
  route('/plan', () => import('../components/PlannerScreen').then(({ PlannerScreen }) => ({ default: PlannerScreen })), 'blocked', 'standard', 'adults', '/chores'),
  route('/chores', () => import('../components/ChoresScreen').then(({ ChoresScreen }) => ({ default: ChoresScreen }))),
  route('/activities', () => import('../components/ActivitiesScreen').then(({ ActivitiesScreen }) => ({ default: ActivitiesScreen }))),
  route('/health', () => import('../components/HealthScreen').then(({ HealthScreen }) => ({ default: HealthScreen })), 'blocked', 'standard', 'adults', '/more'),
  route('/meals', () => import('../components/meals/MealPlanScreen').then(({ MealPlanScreen }) => ({ default: MealPlanScreen }))),
  route('/shopping', () => import('../components/ShoppingScreen').then(({ ShoppingScreen }) => ({ default: ShoppingScreen })), 'available'),
  route('/family', () => import('../components/FamilyScreen').then(({ FamilyScreen }) => ({ default: FamilyScreen })), 'blocked', 'standard', 'adults', '/more'),
  route('/messages', () => import('../components/messages/MessagesScreen').then(({ MessagesScreen }) => ({ default: MessagesScreen }))),
  route('/more', () => import('../components/MoreScreen').then(({ MoreScreen }) => ({ default: MoreScreen }))),
  route('/reminders', () => import('../components/reminders/ReminderCenter').then(({ ReminderCenter }) => ({ default: ReminderCenter }))),
  route('/arcade', () => import('../features/arcade/components/ArcadeScreen').then(({ ArcadeScreen }) => ({ default: ArcadeScreen })), 'available', 'fullscreen'),
  route('/arcade/family-jump', () => import('../features/family-jump/components/FamilyJumpScreen').then(({ FamilyJumpScreen }) => ({ default: FamilyJumpScreen })), 'available', 'fullscreen'),
  route('/arcade/family-fleet', () => import('../features/family-fleet/components/FamilyFleetScreen').then(({ FamilyFleetScreen }) => ({ default: FamilyFleetScreen })), 'available', 'fullscreen'),
  route('/family-jump', () => import('./LegacyFamilyJumpRedirect').then(({ LegacyFamilyJumpRedirect }) => ({ default: LegacyFamilyJumpRedirect })), 'available', 'fullscreen'),
] as const satisfies readonly RouteDefinition[]

const ROUTES_BY_PATH = new Map<Route, RouteDefinition>(
  ROUTE_REGISTRY.map((definition) => [definition.path, definition]),
)

export function getRouteDefinition(path: Route): RouteDefinition {
  const definition = ROUTES_BY_PATH.get(path)
  if (!definition) throw new Error(`Missing route definition for ${path}`)
  return definition
}

export function routeIsAvailableOffline(path: Route): boolean {
  return getRouteDefinition(path).offline === 'available'
}

export function routeIsAllowedForRole(path: Route, role: 'admin' | 'parent' | 'child' | null | undefined): boolean {
  if (!role) return false
  return getRouteDefinition(path).access === 'all-members' || role === 'admin' || role === 'parent'
}

function route(
  path: Route,
  load: RouteDefinition['load'],
  offline: RouteOfflinePolicy = 'blocked',
  shell: RouteShell = 'standard',
  access: RouteAccess = 'all-members',
  fallback: Route = '/',
): RouteDefinition {
  return { path, load, offline, shell, access, fallback }
}

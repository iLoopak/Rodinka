import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { Route } from '../router'
import { getRouteDefinition, routeIsAllowedForRole } from '../routes/routeRegistry'

type Actor = Pick<FamilyMember, 'id' | 'family_id' | 'role'>
type TargetMember = Pick<FamilyMember, 'id' | 'family_id'>

export const ADULT_PRIMARY_ROUTES = ['/', '/calendar', '/messages', '/plan', '/family'] as const satisfies readonly Route[]
export const CHILD_PRIMARY_ROUTES = ['/', '/calendar', '/messages', '/chores', '/shopping'] as const satisfies readonly Route[]

export function primaryNavigationRoutes(actor: Actor): readonly Route[] {
  return actor.role === 'child' ? CHILD_PRIMARY_ROUTES : ADULT_PRIMARY_ROUTES
}

export function childPrimaryRouteForPath(route: Route): (typeof CHILD_PRIMARY_ROUTES)[number] {
  if (route === '/activities' || route === '/meals' || route === '/reminders') return '/more'
  if (route === '/plan') return '/chores'
  if (route === '/health' || route === '/family') return '/more'
  if (route === '/messages') return '/messages'
  if (route === '/calendar' || route === '/chores' || route === '/shopping' || route === '/more') return route
  return '/'
}

export interface UiCapabilities {
  isChild: boolean
  manageHousehold: boolean
  createPlannerItems: boolean
  manageTaskDefinitions: boolean
  approveTaskCompletions: boolean
  manageAllowance: boolean
  manageActivities: boolean
  manageMedicalRecords: boolean
  manageMeals: boolean
  manageShoppingSettings: boolean
  accessRoute: (route: Route) => boolean
  completeTaskFor: (familyId: string, effectiveAssigneeId: string | null) => boolean
  voteFor: (member: TargetMember) => boolean
  editProfile: (member: TargetMember) => boolean
}

export function capabilitiesFor(actor: Actor | null | undefined): UiCapabilities {
  const isAdult = actor?.role === 'admin' || actor?.role === 'parent'
  const isChild = actor?.role === 'child'
  const sameFamily = (target: { family_id: string }) => Boolean(actor && actor.family_id === target.family_id)

  return {
    isChild,
    manageHousehold: isAdult,
    createPlannerItems: isAdult,
    manageTaskDefinitions: isAdult,
    approveTaskCompletions: isAdult,
    manageAllowance: isAdult,
    manageActivities: isAdult,
    manageMedicalRecords: isAdult,
    manageMeals: isAdult,
    manageShoppingSettings: isAdult,
    accessRoute: (route) => routeIsAllowedForRole(route, actor?.role),
    completeTaskFor: (familyId, effectiveAssigneeId) => Boolean(
      actor && actor.family_id === familyId && (isAdult || (isChild && actor.id === effectiveAssigneeId))
    ),
    voteFor: (member) => Boolean(actor && sameFamily(member) && (isAdult || (isChild && actor.id === member.id))),
    editProfile: (member) => Boolean(actor && sameFamily(member) && (isAdult || (isChild && actor.id === member.id))),
  }
}

export function childRouteFallback(route: Route): Route {
  return getRouteDefinition(route).fallback
}

import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { AllowancePlan } from '../hooks/useAllowancePlans'

interface Actor {
  id?: string
  role: FamilyMember['role']
  family_id: string
  status?: string | null
}

/**
 * The one plan a child can currently have. Archived plans are history — a
 * removed or superseded plan stays in the table so its settled cycles keep
 * their reference — so they never count as the child's current plan.
 */
export function activeAllowancePlanFor(plans: AllowancePlan[], memberId: string): AllowancePlan | null {
  return plans.find((plan) => plan.member_id === memberId && plan.status !== 'archived') ?? null
}

/**
 * Mirrors is_family_parent plus the plan's child-only trigger: an active
 * parent or admin managing a child in their own family. The server re-checks
 * both, so this only decides whether to offer the action.
 */
export function canManageAllowance(actor: Actor | null | undefined, member: FamilyMember): boolean {
  if (!actor || (actor.status ?? 'active') !== 'active') return false
  if (actor.role !== 'admin' && actor.role !== 'parent') return false
  if (actor.family_id !== member.family_id) return false
  if (member.role !== 'child') return false
  return (member.status ?? 'active') === 'active'
}

import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { ChildAccount } from '../hooks/useChildAccounts'
import { t } from '../strings'

export type ChildAccountState = 'none' | 'provisioning' | 'active' | 'revoked'

export function childAccountStatusLabel(state: ChildAccountState): string {
  const copy = t.family.childAccount
  if (state === 'active') return copy.statusActive
  if (state === 'revoked') return copy.statusRevoked
  if (state === 'provisioning') return copy.statusProvisioning
  return copy.statusNone
}

interface Actor {
  role: FamilyMember['role']
  family_id: string
  status?: FamilyMember['status']
}

// members.user_id stays the canonical "can this person sign in" link; the
// child_accounts row only describes the managed account wrapped around it.
// They can disagree while a provision is mid-flight or after a detach that
// hasn't been reconciled, so the member row wins for anything user-visible.
export function childAccountState(member: FamilyMember, account: ChildAccount | null | undefined): ChildAccountState {
  if (member.role !== 'child') return 'none'
  if (member.user_id) return 'active'
  if (!account) return 'none'
  if (account.status === 'provisioning') return 'provisioning'
  return 'revoked'
}

export function canManageChildAccount(actor: Actor | null | undefined, member: FamilyMember): boolean {
  if (!actor || (actor.status ?? 'active') !== 'active') return false
  if (actor.role !== 'admin' && actor.role !== 'parent') return false
  if (actor.family_id !== member.family_id) return false
  if (member.role !== 'child') return false
  return (member.status ?? 'active') === 'active'
}

// A child may see their own login name; nobody else's account details are
// exposed to them, and no internal Auth identifiers are ever surfaced.
export function canViewChildAccountDetails(actor: Actor & { id?: string }, member: FamilyMember): boolean {
  if (canManageChildAccount(actor, member)) return true
  return Boolean(actor.id && actor.id === member.id && member.role === 'child')
}

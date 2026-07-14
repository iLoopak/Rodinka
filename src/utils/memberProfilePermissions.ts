import type { FamilyMember } from '../hooks/useFamilyMembers'

export type MemberProfileAccess = 'full' | 'limited' | 'none'

export interface EditableMemberProfileFields {
  displayName: boolean
  birthDate: boolean
  color: boolean
  avatar: boolean
  grammaticalGender: boolean
}

const NO_FIELDS: EditableMemberProfileFields = {
  displayName: false,
  birthDate: false,
  color: false,
  avatar: false,
  grammaticalGender: false,
}

export function memberProfileAccess(
  actor: Pick<FamilyMember, 'id' | 'family_id' | 'role'>,
  target: Pick<FamilyMember, 'id' | 'family_id' | 'role'>
): MemberProfileAccess {
  if (actor.family_id !== target.family_id) return 'none'

  if (actor.role === 'admin' || actor.role === 'parent') {
    return actor.id === target.id || target.role === 'child' ? 'full' : 'none'
  }

  return actor.role === 'child' && actor.id === target.id ? 'limited' : 'none'
}

export function canEditMemberProfile(
  actor: Pick<FamilyMember, 'id' | 'family_id' | 'role'>,
  target: Pick<FamilyMember, 'id' | 'family_id' | 'role'>
): boolean {
  return memberProfileAccess(actor, target) !== 'none'
}

export function editableMemberProfileFields(
  actor: Pick<FamilyMember, 'id' | 'family_id' | 'role'>,
  target: Pick<FamilyMember, 'id' | 'family_id' | 'role'>
): EditableMemberProfileFields {
  const access = memberProfileAccess(actor, target)
  if (access === 'none') return { ...NO_FIELDS }
  const canEditIdentity = access === 'full'
  return {
    displayName: canEditIdentity,
    birthDate: canEditIdentity,
    color: true,
    avatar: true,
    grammaticalGender: true,
  }
}

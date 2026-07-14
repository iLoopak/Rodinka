import type { FamilyMember } from '../hooks/useFamilyMembers'

export function createMemberLookup(members: FamilyMember[]) {
  const byId = new Map(members.map((member) => [member.id, member]))
  return (id: string): FamilyMember | undefined => byId.get(id)
}

export function resolveCurrentMember(
  initialMember: FamilyMember,
  memberById: (id: string) => FamilyMember | undefined
): FamilyMember {
  return memberById(initialMember.id) ?? initialMember
}

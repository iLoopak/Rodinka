import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Member } from '../../hooks/useFamily'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { resolveCurrentMember } from '../../utils/memberLookup'
import { MemberLookupBridge } from './currentMemberBridge'

interface FamilyCoreContextValue {
  familyId: string
  userId: string
  userEmail: string
  baseMember: Member
}

const FamilyCoreContext = createContext<FamilyCoreContextValue | null>(null)

interface ProviderProps {
  member: Member
  userId: string
  userEmail: string
  children: ReactNode
}

// Small and stable on purpose: no chores/activities/meals/shopping/medical
// data is loaded here, so a mutation in any other domain never re-renders
// something that only needs identity (familyId/currentMember/isParentOrAdmin).
export function FamilyCoreProvider({ member, userId, userEmail, children }: ProviderProps) {
  const value = useMemo<FamilyCoreContextValue>(
    () => ({ familyId: member.family_id, userId, userEmail, baseMember: member }),
    [member, userId, userEmail]
  )
  return <FamilyCoreContext.Provider value={value}>{children}</FamilyCoreContext.Provider>
}

export interface FamilyCoreValue {
  familyId: string
  userId: string
  userEmail: string
  currentMember: FamilyMember
  isParentOrAdmin: boolean
}

export function useFamilyCore(): FamilyCoreValue {
  const ctx = useContext(FamilyCoreContext)
  if (!ctx) throw new Error('useFamilyCore must be used within a FamilyCoreProvider')
  // Optional: FamilyMembersProvider (nested inside) publishes a live lookup
  // so currentMember reflects fresh member data; without it (e.g. isolated
  // tests), fall back to the base member passed in at login.
  const memberById = useContext(MemberLookupBridge)
  const currentMember = memberById ? resolveCurrentMember(ctx.baseMember, memberById) : ctx.baseMember
  const isParentOrAdmin = currentMember.role === 'admin' || currentMember.role === 'parent'
  return { familyId: ctx.familyId, userId: ctx.userId, userEmail: ctx.userEmail, currentMember, isParentOrAdmin }
}

import { createContext } from 'react'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

// FamilyMembersProvider nests inside FamilyCoreProvider (it needs familyId),
// but currentMember/isParentOrAdmin must reflect FamilyMembersContext's live
// `allMembers` (e.g. immediately after the user edits their own profile) —
// otherwise useFamilyCore() would show stale identity data until reload.
// A provider can't read its own descendant's context, so FamilyMembersProvider
// publishes its member lookup here and the useFamilyCore() hook (called by
// leaf components, always inside both providers) reads it. Neither context
// module imports the other; both only import this bridge.
export const MemberLookupBridge = createContext<((id: string) => FamilyMember | undefined) | null>(null)

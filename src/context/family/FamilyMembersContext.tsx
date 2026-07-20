import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isActiveFamilyMember, useFamilyMembers, type FamilyMember } from '../../hooks/useFamilyMembers'
import { useMemberProfiles, type MemberProfileInput } from '../../hooks/useMemberProfiles'
import { createMemberLookup } from '../../utils/memberLookup'
import { chooseLeastUsedMemberColor } from '../../utils/memberColor'
import { MemberLookupBridge } from './currentMemberBridge'
import { SupabaseFamilyMediaStorage } from '../../features/family/data/familyMediaStorage'
import { SupabaseFamilyMembersRepository } from '../../features/family/data/supabaseFamilyRepository'
import type { FamilyMembersRepository } from '../../features/family/data/familyRepository'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

interface FamilyMembersContextValue {
  members: FamilyMember[]
  allMembers: FamilyMember[]
  kids: FamilyMember[]
  membersLoading: boolean
  membersError: string | null
  membersRealtimeStatus: RealtimeConnectionState
  memberById: (id: string) => FamilyMember | undefined
  memberName: (id: string) => string
  addChild: (displayName: string, avatarFile?: File | null) => Promise<void>
  editMemberProfile: (member: FamilyMember, input: MemberProfileInput) => Promise<void>
  removeMember: (memberId: string, replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign', reason?: string) => Promise<void>
  leaveHousehold: (currentMemberId: string, replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign') => Promise<void>
  restoreMember: (memberId: string) => Promise<void>
  permanentlyDeleteRemovedMember: (memberId: string) => Promise<void>
  createInvite: () => Promise<{ code: string; expiresAt: string | null }>
  refreshMembers: () => Promise<void>
}

const FamilyMembersContext = createContext<FamilyMembersContextValue | null>(null)

interface ProviderProps {
  familyId: string
  userId?: string | null
  children: ReactNode
  repository?: FamilyMembersRepository
}

export function FamilyMembersProvider({ familyId, userId = null, children, repository: repositoryOverride }: ProviderProps) {
  const storage = useMemo(() => new SupabaseFamilyMediaStorage(), [])
  const repository = useMemo(() => repositoryOverride ?? new SupabaseFamilyMembersRepository(storage), [repositoryOverride, storage])
  const scope = useMemo(() => ({ familyId, userId }), [familyId, userId])
  const {
    members: allMembers,
    setMembers: setAllMembers,
    loading: membersLoading,
    error: membersError,
    refresh: refreshMembers,
  } = useFamilyMembers(familyId, userId, repository)
  const { saveMemberProfile } = useMemberProfiles(refreshMembers)
  const [membersRealtimeStatus, setMembersRealtimeStatus] = useState<RealtimeConnectionState>('connecting')
  const activeFamilyIdRef = useRef(familyId)
  activeFamilyIdRef.current = familyId

  const members = useMemo(() => allMembers.filter(isActiveFamilyMember), [allMembers])
  const kids = useMemo(() => members.filter((m) => m.role === 'child'), [members])
  const memberById = useMemo(() => createMemberLookup(allMembers), [allMembers])
  const memberName = useMemo(() => (id: string) => memberById(id)?.display_name ?? '?', [memberById])

  useEffect(() => {
    if (!familyId) return
    return repository.subscribe(scope, {
      onStatusChange: (status) => setMembersRealtimeStatus(status as RealtimeConnectionState),
      onMemberChange: (change) => {
        // The repository signs each changed row before handing it over, so a
        // realtime update never blanks an avatar until the next full refresh.
        if (activeFamilyIdRef.current !== familyId) return
        setAllMembers((current) => {
          if (change.action === 'delete') return current.filter((member) => member.id !== change.id)
          const index = current.findIndex((member) => member.id === change.record.id)
          if (index === -1) return [...current, change.record]
          const next = [...current]
          next[index] = change.record
          return next
        })
      },
    })
  }, [familyId, repository, scope, setAllMembers])

  const addChild = useCallback(
    async (displayName: string, avatarFile: File | null = null) => {
      const colorKey = chooseLeastUsedMemberColor(members)
      const created = await repository.createChild(scope, displayName, colorKey)
      if (avatarFile) {
        try {
          await saveMemberProfile(created, {
            displayName,
            birthDate: null,
            colorKey,
            grammaticalGender: null,
            vocativeName: null,
            avatarFile,
            removeAvatar: false,
          })
        } catch (profileError) {
          // The member row exists but its avatar never landed. Rolling the row
          // back is best effort: leaving a half-created child on screen is
          // worse than leaving an orphaned row the admin can remove.
          await repository.deleteMemberRow(scope, created.id).catch((rollbackError: unknown) => {
            console.error('Failed to roll back member after avatar upload failure:', rollbackError instanceof Error ? rollbackError.message : 'unknown error')
          })
          await refreshMembers()
          throw profileError
        }
      } else {
        await refreshMembers()
      }
    },
    [members, refreshMembers, repository, saveMemberProfile, scope]
  )

  const editMemberProfile = useCallback(
    async (member: FamilyMember, input: MemberProfileInput) => {
      await saveMemberProfile(member, input)
    },
    [saveMemberProfile]
  )

  const removeMember = useCallback(async (memberId: string, replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign', reason = '') => {
    await repository.removeMember(memberId, { replacementMemberId, taskStrategy, activityStrategy, reason }, false)
    await refreshMembers()
  }, [refreshMembers, repository])

  const leaveHousehold = useCallback(async (currentMemberId: string, replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign') => {
    await repository.removeMember(
      currentMemberId,
      { replacementMemberId, taskStrategy, activityStrategy, reason: 'self_leave' },
      true,
    )
    window.location.assign('/')
  }, [repository])

  const restoreMember = useCallback(async (memberId: string) => {
    await repository.restoreMember(memberId)
    await refreshMembers()
  }, [refreshMembers, repository])

  const permanentlyDeleteRemovedMember = useCallback(async (memberId: string) => {
    const { avatarPath } = await repository.permanentlyDeleteMember(memberId)
    // The row is gone; the object is cleaned up afterwards and best effort.
    if (avatarPath) await storage.removeAvatar(avatarPath)
    await refreshMembers()
  }, [refreshMembers, repository, storage])

  const createInvite = useCallback(() => repository.createInvite(scope), [repository, scope])

  const value: FamilyMembersContextValue = {
    members,
    allMembers,
    kids,
    membersLoading,
    membersError,
    membersRealtimeStatus,
    memberById,
    memberName,
    addChild,
    editMemberProfile,
    removeMember,
    leaveHousehold,
    restoreMember,
    permanentlyDeleteRemovedMember,
    createInvite,
    refreshMembers,
  }

  return (
    <FamilyMembersContext.Provider value={value}>
      <MemberLookupBridge.Provider value={memberById}>{children}</MemberLookupBridge.Provider>
    </FamilyMembersContext.Provider>
  )
}

export function useFamilyMembersData() {
  const ctx = useContext(FamilyMembersContext)
  if (!ctx) throw new Error('useFamilyMembersData must be used within a FamilyMembersProvider')
  return ctx
}

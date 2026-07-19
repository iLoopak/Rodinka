import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { AVATAR_SIGNED_URL_SECONDS, isActiveFamilyMember, useFamilyMembers, type FamilyMember, type FamilyMemberStatus } from '../../hooks/useFamilyMembers'
import { useMemberProfiles, type MemberProfileInput } from '../../hooks/useMemberProfiles'
import { createMemberLookup } from '../../utils/memberLookup'
import { chooseLeastUsedMemberColor } from '../../utils/memberColor'
import { MemberLookupBridge } from './currentMemberBridge'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
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
  children: ReactNode
}

export function FamilyMembersProvider({ familyId, children }: ProviderProps) {
  const {
    members: allMembers,
    setMembers: setAllMembers,
    loading: membersLoading,
    error: membersError,
    refresh: refreshMembers,
  } = useFamilyMembers(familyId)
  const { saveMemberProfile } = useMemberProfiles(refreshMembers)
  const [membersRealtimeStatus, setMembersRealtimeStatus] = useState<RealtimeConnectionState>('connecting')
  const activeFamilyIdRef = useRef(familyId)
  activeFamilyIdRef.current = familyId

  const members = useMemo(() => allMembers.filter(isActiveFamilyMember), [allMembers])
  const kids = useMemo(() => members.filter((m) => m.role === 'child'), [members])
  const memberById = useMemo(() => createMemberLookup(allMembers), [allMembers])
  const memberName = useMemo(() => (id: string) => memberById(id)?.display_name ?? '?', [memberById])

  // A raw `members` row only carries `avatar_path` — `avatar_url` is a
  // client-derived signed URL (see useFamilyMembers.ts), so an inserted/
  // updated row needs the same signing step before it can be applied to
  // local state, or avatars would render broken until the next full refresh.
  const signMemberAvatar = useCallback(async (row: Record<string, unknown>): Promise<FamilyMember> => {
    const member = {
      ...row,
      status: (row.status as FamilyMemberStatus | undefined) ?? 'active',
      avatar_url: null,
    } as FamilyMember
    if (member.avatar_path) {
      const { data, error } = await supabase.storage.from('member-avatars').createSignedUrl(member.avatar_path, AVATAR_SIGNED_URL_SECONDS)
      if (error) console.error('Failed to sign realtime member avatar:', error.message)
      else member.avatar_url = data.signedUrl
    }
    return member
  }, [])

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:family-members`,
      onStatusChange: setMembersRealtimeStatus,
      tables: [{
        table: 'members',
        filter: `family_id=eq.${familyId}`,
        onInsert: (row) => {
          void signMemberAvatar(row).then((member) => {
            if (activeFamilyIdRef.current !== familyId) return
            setAllMembers((current) => applyRealtimeInsert(current, member))
          })
        },
        onUpdate: (row) => {
          void signMemberAvatar(row).then((member) => {
            if (activeFamilyIdRef.current !== familyId) return
            setAllMembers((current) => applyRealtimeUpdate(current, member))
          })
        },
        onDelete: (row) => {
          setAllMembers((current) => applyRealtimeDelete(current, row.id as string))
        },
      }],
    })
    return unsubscribe
  }, [familyId, setAllMembers, signMemberAvatar])

  const addChild = useCallback(
    async (displayName: string, avatarFile: File | null = null) => {
      const colorKey = chooseLeastUsedMemberColor(members)
      const { data, error } = await supabase
        .from('members')
        .insert({ family_id: familyId, display_name: displayName, role: 'child', color_key: colorKey })
        .select('id, family_id, display_name, role, user_id, birth_date, color_key, custom_color, avatar_path, grammatical_gender, vocative_name')
        .single()
      if (error) throw friendly(error)
      if (avatarFile) {
        try {
          await saveMemberProfile({ ...data, avatar_url: null } as FamilyMember, {
            displayName,
            birthDate: null,
            colorKey,
            grammaticalGender: null,
            vocativeName: null,
            avatarFile,
            removeAvatar: false,
          })
        } catch (profileError) {
          const { error: rollbackError } = await supabase
            .from('members')
            .delete()
            .eq('id', data.id)
            .eq('family_id', familyId)
          if (rollbackError) console.error('Failed to roll back member after avatar upload failure:', rollbackError.message)
          await refreshMembers()
          throw profileError
        }
      } else {
        await refreshMembers()
      }
    },
    [familyId, members, refreshMembers, saveMemberProfile]
  )

  const editMemberProfile = useCallback(
    async (member: FamilyMember, input: MemberProfileInput) => {
      await saveMemberProfile(member, input)
    },
    [saveMemberProfile]
  )

  const removeMember = useCallback(async (memberId: string, replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign', reason = '') => {
    const { error: removalError } = await supabase.rpc('remove_household_member', {
      p_member_id: memberId,
      p_replacement_member_id: replacementMemberId,
      p_task_strategy: taskStrategy,
      p_activity_strategy: activityStrategy,
      p_reason: reason || null,
      p_allow_self: false,
    })
    if (removalError) throw friendly(removalError)
    await refreshMembers()
  }, [refreshMembers])

  const leaveHousehold = useCallback(async (currentMemberId: string, replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign') => {
    const { error: leaveError } = await supabase.rpc('remove_household_member', {
      p_member_id: currentMemberId,
      p_replacement_member_id: replacementMemberId,
      p_task_strategy: taskStrategy,
      p_activity_strategy: activityStrategy,
      p_reason: 'self_leave',
      p_allow_self: true,
    })
    if (leaveError) throw friendly(leaveError)
    window.location.assign('/')
  }, [])

  const restoreMember = useCallback(async (memberId: string) => {
    const { error: restoreError } = await supabase.rpc('restore_household_member', { p_member_id: memberId })
    if (restoreError) throw friendly(restoreError)
    await refreshMembers()
  }, [refreshMembers])

  const permanentlyDeleteRemovedMember = useCallback(async (memberId: string) => {
    const { data, error: deleteError } = await supabase.rpc('permanently_delete_removed_member', { p_member_id: memberId })
    if (deleteError) throw friendly(deleteError)
    const avatarPath = typeof data === 'object' && data && 'avatar_path' in data ? String(data.avatar_path ?? '') : ''
    if (avatarPath) {
      const { error: storageError } = await supabase.storage.from('member-avatars').remove([avatarPath])
      if (storageError) console.error('Failed to delete member avatar after permanent member deletion:', storageError.message)
    }
    await refreshMembers()
  }, [refreshMembers])

  const createInvite = useCallback(async () => {
    const { data: code, error } = await supabase.rpc('create_invite', { fid: familyId })
    if (error) throw friendly(error)
    // Best-effort: fetch expiry for display. Not fatal if this second read fails.
    const { data: invite } = await supabase.from('invites').select('expires_at').eq('code', code).single()
    return { code: code as string, expiresAt: invite?.expires_at ?? null }
  }, [familyId])

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

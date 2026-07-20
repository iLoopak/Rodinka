import { useEffect, useState, useCallback, useMemo } from 'react'
import { cachedQuery, cacheTimes, familyQueryKey, signedUrlMaxAgeMs } from '../queryCache'
import { AVATAR_SIGNED_URL_SECONDS } from '../features/family/data/familyMediaStorage'
import { SupabaseFamilyMembersRepository } from '../features/family/data/supabaseFamilyRepository'
import type { FamilyMembersRepository } from '../features/family/data/familyRepository'
import { t } from '../strings'

export type MemberColorKey =
  | 'coral'
  | 'honey'
  | 'mint'
  | 'blue'
  | 'lavender'
  | 'berry'
  | 'peach'
  | 'sage'

export type GrammaticalGender = 'masculine' | 'feminine' | 'neutral'
export type MemberRole = 'admin' | 'parent' | 'child'
export type FamilyMemberStatus = 'active' | 'inactive' | 'removed'

export interface FamilyMember {
  id: string
  family_id: string
  display_name: string
  role: MemberRole
  user_id: string | null
  birth_date: string | null
  color_key: MemberColorKey | null
  custom_color?: string | null
  avatar_path: string | null
  avatar_url: string | null
  grammatical_gender: GrammaticalGender | null
  vocative_name: string | null
  status?: FamilyMemberStatus
  removed_at?: string | null
  removed_by_member_id?: string | null
  removal_reason?: string | null
}

export function isActiveFamilyMember(member: FamilyMember) {
  return (member.status ?? 'active') === 'active'
}

export { AVATAR_SIGNED_URL_SECONDS }

export function useFamilyMembers(familyId: string | undefined, userId: string | null = null, repositoryOverride?: FamilyMembersRepository) {
  const repository = useMemo(() => repositoryOverride ?? new SupabaseFamilyMembersRepository(), [repositoryOverride])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await cachedQuery({
        key: familyQueryKey('members', familyId),
        scope: { userId, familyId },
        staleTimeMs: cacheTimes.stable,
        maxAgeMs: signedUrlMaxAgeMs(AVATAR_SIGNED_URL_SECONDS),
        persist: true,
        queryName: 'members.list',
        table: 'members,member-avatars',
        reason: 'mount',
        fetcher: () => repository.listMembers({ familyId, userId }),
      })
      setMembers(result.data)
      setError(result.stale ? t.errors.loadFailed : null)
    } catch (loadError) {
      console.error('Failed to load family members:', loadError instanceof Error ? loadError.message : 'unknown error')
      setMembers([])
      setError(t.errors.loadFailed)
    }
    setLoading(false)
  }, [familyId, repository, userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { members, setMembers, loading, error, refresh }
}

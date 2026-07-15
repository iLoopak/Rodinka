import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import type { FamilyMember } from './useFamilyMembers'
import { getShoppingLocalStore } from '../shopping/shoppingIndexedDb'

export type Member = FamilyMember

export function useFamily(userId: string | undefined) {
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) {
      setMember(null)
      setLoading(false)
      return
    }

    const cached = await getShoppingLocalStore().loadFamilyIdentity(userId)
    if (cached) {
      setMember(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false)
      return
    }
    // RLS ensures this only ever returns rows the current user is allowed to see
    const { data, error } = await supabase
      .from('members')
      .select('id, family_id, display_name, role, user_id, birth_date, color_key, avatar_path, grammatical_gender, vocative_name, status, removed_at, removed_by_member_id, removal_reason')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      console.error('Failed to load family membership:', error.message)
      if (!cached) setMember(null)
    } else {
      const next = data ? ({ ...data, avatar_url: null } as Member) : null
      setMember(next)
      await getShoppingLocalStore().saveFamilyIdentity(userId, next)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { member, loading, refresh }
}

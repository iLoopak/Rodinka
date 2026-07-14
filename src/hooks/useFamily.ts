import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import type { FamilyMember } from './useFamilyMembers'

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

    setLoading(true)
    // RLS ensures this only ever returns rows the current user is allowed to see
    const { data, error } = await supabase
      .from('members')
      .select('id, family_id, display_name, role, user_id, birth_date, color_key, avatar_path, grammatical_gender, vocative_name')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load family membership:', error.message)
      setMember(null)
    } else {
      setMember(data ? ({ ...data, avatar_url: null } as Member) : null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { member, loading, refresh }
}

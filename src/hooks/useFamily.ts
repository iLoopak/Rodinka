import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export interface Member {
  id: string
  family_id: string
  display_name: string
  role: 'admin' | 'parent' | 'child'
}

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
      .select('id, family_id, display_name, role')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load family membership:', error.message)
      setMember(null)
    } else {
      setMember(data)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { member, loading, refresh }
}

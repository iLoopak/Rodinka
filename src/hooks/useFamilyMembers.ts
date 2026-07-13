import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export interface FamilyMember {
  id: string
  display_name: string
  role: 'admin' | 'parent' | 'child'
  user_id: string | null
}

export function useFamilyMembers(familyId: string | undefined) {
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
    const { data, error } = await supabase
      .from('members')
      .select('id, display_name, role, user_id')
      .eq('family_id', familyId)
      .order('display_name')

    if (error) {
      console.error('Failed to load family members:', error.message)
      setMembers([])
      setError(t.errors.loadFailed)
    } else {
      setMembers(data)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { members, loading, error, refresh }
}

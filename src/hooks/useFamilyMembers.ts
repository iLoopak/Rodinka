import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export interface FamilyMember {
  id: string
  display_name: string
  role: 'admin' | 'parent' | 'child'
}

export function useFamilyMembers(familyId: string | undefined) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('members')
      .select('id, display_name, role')
      .eq('family_id', familyId)
      .order('display_name')

    if (error) {
      console.error('Failed to load family members:', error.message)
      setMembers([])
    } else {
      setMembers(data)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { members, loading, refresh }
}

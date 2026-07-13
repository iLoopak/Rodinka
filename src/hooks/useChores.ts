import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export interface Chore {
  id: string
  family_id: string
  title: string
  description: string | null
  assigned_to: string
  reward_amount: number
  recurring: boolean
  created_at: string
}

export function useChores(familyId: string | undefined) {
  const [chores, setChores] = useState<Chore[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setChores([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('chores')
      .select('id, family_id, title, description, assigned_to, reward_amount, recurring, created_at')
      .eq('family_id', familyId)
      .order('created_at')

    if (error) {
      console.error('Failed to load chores:', error.message)
      setChores([])
    } else {
      setChores(data)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { chores, loading, refresh }
}

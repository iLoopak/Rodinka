import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export interface Chore {
  id: string
  family_id: string
  title: string
  description: string | null
  assigned_to: string
  due_date: string
  reward_amount: number
  recurring: boolean
  created_at: string
}

export function useChores(familyId: string | undefined) {
  const [chores, setChores] = useState<Chore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setChores([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('chores')
      .select('id, family_id, title, description, assigned_to, due_date, reward_amount, recurring, created_at')
      .eq('family_id', familyId)
      .order('created_at')

    if (error) {
      console.error('Failed to load chores:', error.message)
      setChores([])
      setError(t.errors.loadFailed)
    } else {
      setChores(data)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { chores, loading, error, refresh }
}

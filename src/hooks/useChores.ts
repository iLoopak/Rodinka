import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { normalizeChore, type Chore } from '../utils/choreModel'

export type { Chore } from '../utils/choreModel'

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
      .select('id, family_id, title, description, assigned_to, due_date, reward_amount, recurring, recurrence_type, recurrence_weekdays, preferred_day_of_month, status, created_at, updated_at')
      .eq('family_id', familyId)
      .order('created_at')

    if (error) {
      console.error('Failed to load chores:', error.message)
      setChores([])
      setError(t.errors.loadFailed)
    } else {
      setChores((data ?? []).map((row) => normalizeChore(row)))
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { chores, loading, error, refresh }
}

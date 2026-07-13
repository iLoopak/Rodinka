import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other'
export type MealPlanStatus = 'proposed' | 'confirmed' | 'completed' | 'skipped'
export type MealPlanOrigin = 'manual' | 'vote' | 'copied'

export interface MealPlanEntry {
  id: string
  family_id: string
  entry_date: string
  meal_slot: MealSlot
  meal_id: string | null
  title: string | null
  responsible_member_id: string | null
  notes: string | null
  status: MealPlanStatus
  origin: MealPlanOrigin
  source_entry_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export function useMealPlanEntries(familyId: string | undefined) {
  const [planEntries, setPlanEntries] = useState<MealPlanEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setPlanEntries([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('meal_plan_entries')
      .select('id, family_id, entry_date, meal_slot, meal_id, title, responsible_member_id, notes, status, origin, source_entry_id, created_by, created_at, updated_at')
      .eq('family_id', familyId)
      .order('entry_date')

    if (error) {
      console.error('Failed to load meal plan entries:', error.message)
      setPlanEntries([])
      setError(t.errors.loadFailed)
    } else {
      setPlanEntries(data)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { planEntries, loading, error, refresh }
}

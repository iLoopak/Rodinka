import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert' | 'other'
export type MealStatus = 'active' | 'archived'

export interface Meal {
  id: string
  family_id: string
  name: string
  description: string | null
  category: MealCategory
  tags: string[]
  prep_minutes: number | null
  notes: string | null
  source_url: string | null
  status: MealStatus
  created_by: string
  created_at: string
  updated_at: string
}

export function useMeals(familyId: string | undefined) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setMeals([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('meals')
      .select('id, family_id, name, description, category, tags, prep_minutes, notes, source_url, status, created_by, created_at, updated_at')
      .eq('family_id', familyId)
      .order('name')

    if (error) {
      console.error('Failed to load meals:', error.message)
      setMeals([])
      setError(t.errors.loadFailed)
    } else {
      setMeals(data)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { meals, loading, error, refresh }
}

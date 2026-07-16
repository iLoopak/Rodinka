import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { normalizeChore, type Chore } from '../utils/choreModel'
import { isInitialFamilyDataLoad } from '../utils/familyDataLoading'

export type { Chore } from '../utils/choreModel'

export function useChores(familyId: string | undefined) {
  const [chores, setChores] = useState<Chore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadedFamilyIdRef = useRef<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!familyId) {
      loadedFamilyIdRef.current = undefined
      setChores([])
      setLoading(false)
      return
    }

    const initialLoad = isInitialFamilyDataLoad(loadedFamilyIdRef.current, familyId)
    if (initialLoad) setLoading(true)
    const { data, error } = await supabase
      .from('chores')
      .select('id, family_id, title, description, assigned_to, due_date, reward_amount, reward_enabled, reward_currency, requires_approval, category, priority, recurring, recurrence_type, recurrence_weekdays, preferred_day_of_month, status, sort_order, created_at, updated_at')
      .eq('family_id', familyId)
      .order('sort_order')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load chores:', error.message)
      if (initialLoad) setChores([])
      setError(t.errors.loadFailed)
    } else {
      setChores((data ?? []).map((row) => normalizeChore(row)))
      setError(null)
      loadedFamilyIdRef.current = familyId
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const reorder = useCallback(async (orderedIds: string[]) => {
    if (!familyId || orderedIds.length < 2) return
    const previous = chores
    const positions = new Map(orderedIds.map((id, index) => [id, (index + 1) * 1024]))
    setChores((current) => [...current.map((chore) => positions.has(chore.id) ? { ...chore, sort_order: positions.get(chore.id)! } : chore)]
      .sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at)))
    const { error } = await supabase.rpc('reorder_household_tasks', { p_family_id: familyId, p_ordered_ids: orderedIds })
    if (error) {
      setChores(previous)
      throw new Error(t.errors.generic)
    }
    await refresh()
  }, [chores, familyId, refresh])

  return { chores, setChores, loading, error, refresh, reorder }
}

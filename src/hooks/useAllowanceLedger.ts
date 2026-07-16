import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { isInitialFamilyDataLoad } from '../utils/familyDataLoading'

export interface LedgerEntry {
  id: string
  member_id: string
  amount: number
  reason: string | null
  created_at: string
  entry_type: 'chore_reward' | 'monthly_allowance' | 'payout' | 'adjustment'
  source_chore_completion_id: string | null
  source_allowance_cycle_id: string | null
}

export function useAllowanceLedger(familyId: string | undefined) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadedFamilyIdRef = useRef<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!familyId) {
      loadedFamilyIdRef.current = undefined
      setEntries([])
      setLoading(false)
      return
    }

    const initialLoad = isInitialFamilyDataLoad(loadedFamilyIdRef.current, familyId)
    if (initialLoad) setLoading(true)
    const { data, error } = await supabase
      .from('allowance_ledger')
      .select('id, member_id, amount, reason, created_at, entry_type, source_chore_completion_id, source_allowance_cycle_id')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load allowance ledger:', error.message)
      if (initialLoad) setEntries([])
      setError(t.errors.loadFailed)
    } else {
      setEntries(data)
      setError(null)
      loadedFamilyIdRef.current = familyId
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { entries, setEntries, loading, error, refresh }
}

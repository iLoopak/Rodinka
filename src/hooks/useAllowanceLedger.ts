import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { SupabaseAllowanceRepository } from '../features/allowance/data/supabaseAllowanceRepository'
import { t } from '../strings'
import { isInitialFamilyDataLoad } from '../utils/familyDataLoading'

export interface LedgerEntry {
  id: string
  member_id: string | null
  amount: number
  reason: string | null
  created_at: string
  entry_type: 'chore_reward' | 'monthly_allowance' | 'payout' | 'adjustment'
  source_chore_completion_id: string | null
  source_allowance_cycle_id: string | null
}

export function useAllowanceLedger(familyId: string | undefined) {
  const repository = useMemo(() => new SupabaseAllowanceRepository(), [])
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

    // Only the first load for a family shows a spinner; a settlement refresh
    // stays in the background so the ledger does not blank out under the user.
    const initialLoad = isInitialFamilyDataLoad(loadedFamilyIdRef.current, familyId)
    if (initialLoad) setLoading(true)
    try {
      setEntries(await repository.listLedger({ familyId }))
      setError(null)
      loadedFamilyIdRef.current = familyId
    } catch (loadError) {
      console.error('Failed to load allowance ledger:', loadError instanceof Error ? loadError.message : 'unknown error')
      if (initialLoad) setEntries([])
      setError(t.errors.loadFailed)
    }
    setLoading(false)
  }, [familyId, repository])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { entries, setEntries, loading, error, refresh }
}

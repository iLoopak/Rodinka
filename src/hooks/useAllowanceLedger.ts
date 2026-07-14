import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

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

  const refresh = useCallback(async () => {
    if (!familyId) {
      setEntries([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('allowance_ledger')
      .select('id, member_id, amount, reason, created_at, entry_type, source_chore_completion_id, source_allowance_cycle_id')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load allowance ledger:', error.message)
      setEntries([])
      setError(t.errors.loadFailed)
    } else {
      setEntries(data)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { entries, loading, error, refresh }
}

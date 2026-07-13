import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export interface LedgerEntry {
  id: string
  member_id: string
  amount: number
  reason: string | null
  created_at: string
}

export function useAllowanceLedger(familyId: string | undefined) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setEntries([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('allowance_ledger')
      .select('id, member_id, amount, reason, created_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load allowance ledger:', error.message)
      setEntries([])
    } else {
      setEntries(data)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { entries, loading, refresh }
}

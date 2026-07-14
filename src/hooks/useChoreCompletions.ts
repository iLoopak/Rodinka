import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export interface ChoreCompletion {
  id: string
  chore_id: string
  completed_by: string
  completed_at: string
  status: 'pending_approval' | 'approved' | 'rejected'
  approved_by: string | null
  approved_at: string | null
  occurrence_due_date: string
  chore_title: string
  reward_amount: number
  assigned_member_id?: string | null
  assignment_was_override?: boolean
  requires_approval?: boolean
  reward_enabled?: boolean
  task_category?: string | null
}

export function useChoreCompletions(familyId: string | undefined) {
  const [completions, setCompletions] = useState<ChoreCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setCompletions([])
      setLoading(false)
      return
    }

    setLoading(true)
    // Filter via the embedded `chores` relation since completions don't
    // carry family_id directly (see RLS policy in 003_chores.sql).
    const { data, error } = await supabase
      .from('chore_completions')
      .select('id, chore_id, completed_by, completed_at, status, approved_by, approved_at, occurrence_due_date, chore_title, reward_amount, assigned_member_id, assignment_was_override, requires_approval, reward_enabled, task_category, chores!inner(family_id)')
      .eq('chores.family_id', familyId)
      .order('completed_at', { ascending: false })

    if (error) {
      console.error('Failed to load chore completions:', error.message)
      setCompletions([])
      setError(t.errors.loadFailed)
    } else {
      setCompletions((data ?? []).map((row) => ({ ...row, reward_amount: Number(row.reward_amount) })))
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { completions, loading, error, refresh }
}

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { useChores, type Chore } from '../../hooks/useChores'
import { useChoreCompletions, type ChoreCompletion } from '../../hooks/useChoreCompletions'
import { choreInputToRow, type ChoreInput } from '../../utils/choreModel'
import { compareChoresByDueDate, todayISODate } from '../../utils/dueDate'
import type { ChoreApprovalResult } from '../../domain/chores/types'

export type { ChoreInput } from '../../utils/choreModel'
export type { ChoreApprovalResult } from '../../domain/chores/types'

interface ChoresContextValue {
  chores: Chore[]
  completions: ChoreCompletion[]
  pendingCompletions: ChoreCompletion[]
  choresLoading: boolean
  choresError: string | null
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  addChore: (input: ChoreInput) => Promise<void>
  updateChore: (id: string, input: ChoreInput) => Promise<void>
  setChoreArchived: (id: string, archived: boolean) => Promise<void>
  reorderQuickTodos: (orderedIds: string[]) => Promise<void>
  markDone: (choreId: string, assignedTo?: string, occurrenceDate?: string) => Promise<void>
  approve: (completionId: string) => Promise<ChoreApprovalResult>
  reject: (completionId: string) => Promise<void>
  refreshChores: () => Promise<void>
  refreshCompletions: () => Promise<void>
}

const ChoresContext = createContext<ChoresContextValue | null>(null)

interface ProviderProps {
  familyId: string
  userId: string
  currentMemberId: string
  children: ReactNode
}

export function ChoresProvider({ familyId, userId, currentMemberId, children }: ProviderProps) {
  const {
    chores: rawChores,
    loading: choresLoading,
    error: choresError,
    refresh: refreshChores,
    reorder: reorderQuickTodos,
  } = useChores(familyId)
  const {
    completions,
    loading: completionsLoading,
    error: completionsError,
    refresh: refreshCompletions,
  } = useChoreCompletions(familyId)

  const chores = useMemo(() => [...rawChores].sort(compareChoresByDueDate), [rawChores])
  const pendingCompletions = useMemo(() => completions.filter((c) => c.status === 'pending_approval'), [completions])
  const latestCompletionFor = useMemo(() => {
    // `completions` is ordered newest-first by the hook, so the first match is the latest.
    return (choreId: string) => completions.find((c) => c.chore_id === choreId) ?? null
  }, [completions])

  const addChore = useCallback(
    async (input: ChoreInput) => {
      const { error } = await supabase.from('chores').insert({
        family_id: familyId,
        created_by: userId,
        created_by_member_id: currentMemberId,
        ...choreInputToRow(input),
      })
      if (error) throw friendly(error)
      await refreshChores()
    },
    [currentMemberId, familyId, userId, refreshChores]
  )

  const updateChore = useCallback(
    async (id: string, input: ChoreInput) => {
      const { error } = await supabase
        .from('chores')
        .update(choreInputToRow(input))
        .eq('id', id)
        .eq('family_id', familyId)
      if (error) throw friendly(error)
      await refreshChores()
    },
    [familyId, refreshChores]
  )

  const setChoreArchived = useCallback(
    async (id: string, archived: boolean) => {
      const { error } = await supabase
        .from('chores')
        .update({ status: archived ? 'archived' : 'active' })
        .eq('id', id)
        .eq('family_id', familyId)
      if (error) throw friendly(error)
      await refreshChores()
    },
    [familyId, refreshChores]
  )

  const markDone = useCallback(
    async (choreId: string, _assignedTo?: string, occurrenceDate?: string) => {
      const { error } = await supabase.rpc('complete_household_task', {
        p_task_id: choreId,
        p_occurrence_date: occurrenceDate ?? null,
      })
      if (error) throw friendly(error)
      await Promise.all([refreshChores(), refreshCompletions()])
    },
    [refreshChores, refreshCompletions]
  )

  const approve = useCallback(
    async (completionId: string) => {
      const { data, error } = await supabase.rpc('approve_chore_completion', {
        completion_id: completionId,
        approval_date: todayISODate(),
      })
      if (error) throw friendly(error)
      await Promise.all([refreshChores(), refreshCompletions()])
      const result = data as { chore_id?: string; next_due_date?: string | null } | null
      return {
        choreId: result?.chore_id ?? '',
        nextDueDate: result?.next_due_date ?? null,
      }
    },
    [refreshChores, refreshCompletions]
  )

  const reject = useCallback(
    async (completionId: string) => {
      const { error } = await supabase.rpc('reject_chore_completion', { completion_id: completionId })
      if (error) throw friendly(error)
      await refreshCompletions()
    },
    [refreshCompletions]
  )

  const value: ChoresContextValue = {
    chores,
    completions,
    pendingCompletions,
    choresLoading: choresLoading || completionsLoading,
    choresError: choresError || completionsError,
    latestCompletionFor,
    addChore,
    updateChore,
    setChoreArchived,
    reorderQuickTodos,
    markDone,
    approve,
    reject,
    refreshChores,
    refreshCompletions,
  }

  return <ChoresContext.Provider value={value}>{children}</ChoresContext.Provider>
}

export function useChoresData() {
  const ctx = useContext(ChoresContext)
  if (!ctx) throw new Error('useChoresData must be used within a ChoresProvider')
  return ctx
}

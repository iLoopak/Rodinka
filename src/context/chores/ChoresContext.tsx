import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useChores, type Chore } from '../../hooks/useChores'
import { useChoreCompletions, type ChoreCompletion } from '../../hooks/useChoreCompletions'
import type { ChoreInput } from '../../utils/choreModel'
import { compareChoresByDueDate } from '../../utils/dueDate'
import type { ChoreApprovalResult } from '../../domain/chores/types'
import { createChoresRepository } from '../../repositories/chores/choresRepository'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

export type { ChoreInput } from '../../utils/choreModel'
export type { ChoreApprovalResult } from '../../domain/chores/types'


interface ChoresContextValue {
  chores: Chore[]
  completions: ChoreCompletion[]
  pendingCompletions: ChoreCompletion[]
  choresLoading: boolean
  choresError: string | null
  choresRealtimeStatus: RealtimeConnectionState
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
    setChores,
    loading: choresLoading,
    error: choresError,
    refresh: refreshChores,
    reorder: reorderQuickTodos,
  } = useChores(familyId)
  const {
    completions,
    setCompletions,
    loading: completionsLoading,
    error: completionsError,
    refresh: refreshCompletions,
  } = useChoreCompletions(familyId)
  const [choresRealtimeStatus, setChoresRealtimeStatus] = useState<RealtimeConnectionState>('connecting')
  const choresRepository = useMemo(() => createChoresRepository({ familyId, userId, currentMemberId }), [familyId, userId, currentMemberId])

  useEffect(() => {
    if (!familyId) return
    return choresRepository.subscribeToChanges({
      onStatusChange: setChoresRealtimeStatus,
      onChoresChange: setChores,
      onCompletionsChange: setCompletions,
    })
  }, [familyId, choresRepository, setChores, setCompletions])

  const chores = useMemo(() => [...rawChores].sort(compareChoresByDueDate), [rawChores])
  const pendingCompletions = useMemo(() => completions.filter((c) => c.status === 'pending_approval'), [completions])
  const latestCompletionFor = useMemo(() => {
    // `completions` is ordered newest-first by the hook, so the first match is the latest.
    return (choreId: string) => completions.find((c) => c.chore_id === choreId) ?? null
  }, [completions])

  const addChore = useCallback(
    async (input: ChoreInput) => {
      await choresRepository.create(input)
      await refreshChores()
    },
    [choresRepository, refreshChores]
  )

  const updateChore = useCallback(
    async (id: string, input: ChoreInput) => {
      await choresRepository.update(id, input)
      await refreshChores()
    },
    [choresRepository, refreshChores]
  )

  const setChoreArchived = useCallback(
    async (id: string, archived: boolean) => {
      await choresRepository.setArchived(id, archived)
      await refreshChores()
    },
    [choresRepository, refreshChores]
  )

  const markDone = useCallback(
    async (choreId: string, _assignedTo?: string, occurrenceDate?: string) => {
      await choresRepository.completeOccurrence({ choreId, occurrenceDate })
      await Promise.all([refreshChores(), refreshCompletions()])
    },
    [choresRepository, refreshChores, refreshCompletions]
  )

  const approve = useCallback(
    async (completionId: string) => {
      const result = await choresRepository.approveCompletion(completionId)
      await Promise.all([refreshChores(), refreshCompletions()])
      return result
    },
    [choresRepository, refreshChores, refreshCompletions]
  )

  const reject = useCallback(
    async (completionId: string) => {
      await choresRepository.rejectCompletion(completionId)
      await refreshCompletions()
    },
    [choresRepository, refreshCompletions]
  )

  const value: ChoresContextValue = {
    chores,
    completions,
    pendingCompletions,
    choresLoading: choresLoading || completionsLoading,
    choresError: choresError || completionsError,
    choresRealtimeStatus,
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

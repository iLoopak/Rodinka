import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SupabaseOccurrencesRepository } from '../../features/activities/data/supabaseActivitiesRepository'
import type { OccurrencesRepository } from '../../features/activities/data/activitiesRepository'
import type {
  ActivityParticipantHistory,
  OccurrenceOverride,
  OccurrenceSeriesType,
  SeriesAssignmentHistory,
} from '../../utils/occurrenceAssignments'
import { isInitialFamilyDataLoad } from '../../utils/familyDataLoading'
import type { RealtimeConnectionState } from '../../realtime/connectionState'
import { t } from '../../strings'

interface OccurrenceAssignmentsContextValue {
  occurrenceOverrides: OccurrenceOverride[]
  assignmentHistory: SeriesAssignmentHistory[]
  participantHistory: ActivityParticipantHistory[]
  occurrenceAssignmentsLoading: boolean
  occurrenceAssignmentsError: string | null
  occurrenceAssignmentsRealtimeStatus: RealtimeConnectionState
  setOccurrenceMember: (seriesType: OccurrenceSeriesType, seriesId: string, occurrenceDate: string, memberId: string | null, restoreDefault?: boolean) => Promise<void>
  refreshOccurrenceAssignments: () => Promise<void>
}

const OccurrenceAssignmentsContext = createContext<OccurrenceAssignmentsContextValue | null>(null)

interface ProviderProps {
  familyId: string
  children: ReactNode
  repository?: OccurrencesRepository
}

function upsertById<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((entry) => entry.id === record.id)
  if (index === -1) return [...list, record]
  const next = [...list]
  next[index] = record
  return next
}

/**
 * Shared by Chores and Activities/Calendar: overrides and assignment history
 * are keyed by a `series_type` ('task' | 'activity') spanning both domains and
 * resolved by the same pure functions in `utils/occurrenceAssignments.ts`. One
 * context, reused, rather than a copy per domain.
 */
export function OccurrenceAssignmentsProvider({ familyId, children, repository: repositoryOverride }: ProviderProps) {
  const repository = useMemo(() => repositoryOverride ?? new SupabaseOccurrencesRepository(), [repositoryOverride])
  const scope = useMemo(() => familyId ? { familyId } : null, [familyId])

  const [occurrenceOverrides, setOverrides] = useState<OccurrenceOverride[]>([])
  const [assignmentHistory, setAssignmentHistory] = useState<SeriesAssignmentHistory[]>([])
  const [participantHistory, setParticipantHistory] = useState<ActivityParticipantHistory[]>([])
  const [occurrenceAssignmentsLoading, setLoading] = useState(true)
  const [occurrenceAssignmentsError, setError] = useState<string | null>(null)
  const [occurrenceAssignmentsRealtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionState>('connecting')
  const loadedFamilyIdRef = useRef<string | undefined>(undefined)

  const refreshOccurrenceAssignments = useCallback(async () => {
    if (!scope) {
      loadedFamilyIdRef.current = undefined
      setOverrides([]); setAssignmentHistory([]); setParticipantHistory([]); setLoading(false)
      return
    }
    // Only the first load for a family shows a loading state; later refreshes
    // stay in the background so consumers (the calendar in particular) are not
    // replaced by a spinner.
    if (isInitialFamilyDataLoad(loadedFamilyIdRef.current, scope.familyId)) setLoading(true)
    try {
      const state = await repository.loadOccurrenceState(scope)
      setOverrides(state.overrides)
      setAssignmentHistory(state.assignmentHistory)
      setParticipantHistory(state.participantHistory)
      setError(null)
      loadedFamilyIdRef.current = scope.familyId
    } catch (error) {
      console.error('Failed to load occurrence assignments:', error instanceof Error ? error.message : 'unknown error')
      setError(t.errors.loadFailed)
    }
    setLoading(false)
  }, [repository, scope])

  useEffect(() => { void refreshOccurrenceAssignments() }, [refreshOccurrenceAssignments])

  useEffect(() => {
    if (!scope) return
    return repository.subscribe(scope, {
      onStatusChange: (status) => setRealtimeStatus(status as RealtimeConnectionState),
      onOverrideChange: (change) => setOverrides((current) => change.action === 'delete'
        ? current.filter((entry) => entry.id !== change.id)
        : upsertById(current, change.record)),
      onAssignmentHistoryChange: (change) => setAssignmentHistory((current) => change.action === 'delete'
        ? current.filter((entry) => entry.id !== change.id)
        : upsertById(current, change.record)),
      onParticipantHistoryChange: (change) => setParticipantHistory((current) => change.action === 'delete'
        ? current.filter((entry) => entry.id !== change.id)
        : upsertById(current, change.record)),
    })
  }, [repository, scope])

  const setOccurrenceMember = useCallback(async (
    seriesType: OccurrenceSeriesType,
    seriesId: string,
    occurrenceDate: string,
    memberId: string | null,
    restoreDefault = false,
  ) => {
    const previous = occurrenceOverrides
    const optimistic = previous.filter((item) =>
      !(item.series_type === seriesType && item.series_id === seriesId && item.occurrence_date === occurrenceDate))
    if (!restoreDefault) optimistic.push({
      id: `optimistic:${seriesType}:${seriesId}:${occurrenceDate}`,
      family_id: scope?.familyId ?? '',
      series_type: seriesType,
      series_id: seriesId,
      occurrence_date: occurrenceDate,
      companion_member_id: seriesType === 'activity' ? memberId : null,
      assignee_member_id: seriesType === 'task' ? memberId : null,
      cancelled: false,
      updated_at: new Date().toISOString(),
    })
    setOverrides(optimistic)

    try {
      await repository.setMemberOverride({ seriesType, seriesId, occurrenceDate, memberId, restoreDefault })
    } catch (error) {
      // The RPC is transactional: a failure means nothing was written, so the
      // whole optimistic state rolls back rather than being half-applied.
      setOverrides(previous)
      throw error
    }
    // The server may replace the optimistic row's id and touch history, so the
    // canonical state is re-read. Realtime would deliver it too, but the sheet
    // closes on resolve and should not depend on that timing.
    await refreshOccurrenceAssignments()
  }, [occurrenceOverrides, refreshOccurrenceAssignments, repository, scope])

  const value: OccurrenceAssignmentsContextValue = {
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    occurrenceAssignmentsLoading,
    occurrenceAssignmentsError,
    occurrenceAssignmentsRealtimeStatus,
    setOccurrenceMember,
    refreshOccurrenceAssignments,
  }

  return <OccurrenceAssignmentsContext.Provider value={value}>{children}</OccurrenceAssignmentsContext.Provider>
}

export function useOccurrenceAssignmentsData() {
  const ctx = useContext(OccurrenceAssignmentsContext)
  if (!ctx) throw new Error('useOccurrenceAssignmentsData must be used within an OccurrenceAssignmentsProvider')
  return ctx
}

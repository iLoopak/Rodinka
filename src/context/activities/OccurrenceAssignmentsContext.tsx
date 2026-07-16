import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOccurrenceAssignments } from '../../hooks/useOccurrenceAssignments'
import type { ActivityParticipantHistory, OccurrenceOverride, OccurrenceSeriesType, SeriesAssignmentHistory } from '../../utils/occurrenceAssignments'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

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
}

// Shared by both Chores and Activities/Calendar: occurrence overrides and
// assignment history are keyed by a series_type ('task'|'activity') enum
// spanning both domains, resolved by the same pure functions in
// utils/occurrenceAssignments.ts. Kept as one context, reused wherever needed,
// rather than duplicated per-domain.
export function OccurrenceAssignmentsProvider({ familyId, children }: ProviderProps) {
  const {
    overrides: occurrenceOverrides,
    setOverrides,
    assignmentHistory,
    setAssignmentHistory,
    participantHistory,
    setParticipantHistory,
    loading: occurrenceAssignmentsLoading,
    error: occurrenceAssignmentsError,
    refresh: refreshOccurrenceAssignments,
    setMemberOverride: setOccurrenceMember,
  } = useOccurrenceAssignments(familyId)
  const [occurrenceAssignmentsRealtimeStatus, setOccurrenceAssignmentsRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:occurrence-assignments`,
      onStatusChange: setOccurrenceAssignmentsRealtimeStatus,
      tables: [
        {
          table: 'occurrence_overrides',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => setOverrides((current) => applyRealtimeInsert(current, row as unknown as OccurrenceOverride)),
          onUpdate: (row) => setOverrides((current) => applyRealtimeUpdate(current, row as unknown as OccurrenceOverride)),
          onDelete: (row) => setOverrides((current) => applyRealtimeDelete(current, row.id as string)),
        },
        {
          table: 'series_assignment_history',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => setAssignmentHistory((current) => applyRealtimeInsert(current, row as unknown as SeriesAssignmentHistory)),
          onUpdate: (row) => setAssignmentHistory((current) => applyRealtimeUpdate(current, row as unknown as SeriesAssignmentHistory)),
          onDelete: (row) => setAssignmentHistory((current) => applyRealtimeDelete(current, row.id as string)),
        },
        {
          table: 'activity_participant_history',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => setParticipantHistory((current) => applyRealtimeInsert(current, row as unknown as ActivityParticipantHistory)),
          onUpdate: (row) => setParticipantHistory((current) => applyRealtimeUpdate(current, row as unknown as ActivityParticipantHistory)),
          onDelete: (row) => setParticipantHistory((current) => applyRealtimeDelete(current, row.id as string)),
        },
      ],
    })
    return unsubscribe
  }, [familyId, setOverrides, setAssignmentHistory, setParticipantHistory])

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

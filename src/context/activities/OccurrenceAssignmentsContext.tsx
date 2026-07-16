import { createContext, useContext, type ReactNode } from 'react'
import { useOccurrenceAssignments } from '../../hooks/useOccurrenceAssignments'
import type { ActivityParticipantHistory, OccurrenceOverride, OccurrenceSeriesType, SeriesAssignmentHistory } from '../../utils/occurrenceAssignments'

interface OccurrenceAssignmentsContextValue {
  occurrenceOverrides: OccurrenceOverride[]
  assignmentHistory: SeriesAssignmentHistory[]
  participantHistory: ActivityParticipantHistory[]
  occurrenceAssignmentsLoading: boolean
  occurrenceAssignmentsError: string | null
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
    assignmentHistory,
    participantHistory,
    loading: occurrenceAssignmentsLoading,
    error: occurrenceAssignmentsError,
    refresh: refreshOccurrenceAssignments,
    setMemberOverride: setOccurrenceMember,
  } = useOccurrenceAssignments(familyId)

  const value: OccurrenceAssignmentsContextValue = {
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    occurrenceAssignmentsLoading,
    occurrenceAssignmentsError,
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

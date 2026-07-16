import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import type { ActivityParticipantHistory, OccurrenceOverride, OccurrenceSeriesType, SeriesAssignmentHistory } from '../utils/occurrenceAssignments'
import { isInitialFamilyDataLoad } from '../utils/familyDataLoading'

export function useOccurrenceAssignments(familyId: string | undefined) {
  const [overrides, setOverrides] = useState<OccurrenceOverride[]>([])
  const [assignmentHistory, setAssignmentHistory] = useState<SeriesAssignmentHistory[]>([])
  const [participantHistory, setParticipantHistory] = useState<ActivityParticipantHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadedFamilyIdRef = useRef<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!familyId) {
      loadedFamilyIdRef.current = undefined
      setOverrides([]); setAssignmentHistory([]); setParticipantHistory([]); setLoading(false)
      return
    }
    // An override save refreshes the canonical rows after its optimistic update.
    // Keep that synchronization in the background so consumers (e.g. calendar)
    // don't get replaced by a loading state on every override save.
    if (isInitialFamilyDataLoad(loadedFamilyIdRef.current, familyId)) setLoading(true)
    const [overrideResult, historyResult, participantResult] = await Promise.all([
      supabase.from('occurrence_overrides').select('id,family_id,series_type,series_id,occurrence_date,companion_member_id,assignee_member_id,cancelled,updated_at').eq('family_id', familyId),
      supabase.from('series_assignment_history').select('id,family_id,series_type,series_id,effective_from,member_id').eq('family_id', familyId),
      supabase.from('activity_participant_history').select('id,family_id,activity_id,member_id,effective_from,effective_to').eq('family_id', familyId),
    ])
    if (overrideResult.error || historyResult.error || participantResult.error) {
      console.error(overrideResult.error?.message ?? historyResult.error?.message ?? participantResult.error?.message)
      setError(t.errors.loadFailed)
    } else {
      setOverrides((overrideResult.data ?? []) as OccurrenceOverride[])
      setAssignmentHistory((historyResult.data ?? []) as SeriesAssignmentHistory[])
      setParticipantHistory((participantResult.data ?? []) as ActivityParticipantHistory[])
      setError(null)
      loadedFamilyIdRef.current = familyId
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => { void refresh() }, [refresh])

  const setMemberOverride = useCallback(async (seriesType: OccurrenceSeriesType, seriesId: string, occurrenceDate: string, memberId: string | null, restoreDefault = false) => {
    const previous = overrides
    const optimistic = previous.filter((item) => !(item.series_type === seriesType && item.series_id === seriesId && item.occurrence_date === occurrenceDate))
    if (!restoreDefault) optimistic.push({
      id: `optimistic:${seriesType}:${seriesId}:${occurrenceDate}`, family_id: familyId ?? '', series_type: seriesType,
      series_id: seriesId, occurrence_date: occurrenceDate,
      companion_member_id: seriesType === 'activity' ? memberId : null,
      assignee_member_id: seriesType === 'task' ? memberId : null,
      cancelled: false, updated_at: new Date().toISOString(),
    })
    setOverrides(optimistic)
    const { error: saveError } = await supabase.rpc('set_occurrence_member_override', {
      p_series_type: seriesType, p_series_id: seriesId, p_occurrence_date: occurrenceDate,
      p_member_id: memberId, p_restore_default: restoreDefault,
    })
    if (saveError) { setOverrides(previous); throw new Error(t.errors.generic) }
    await refresh()
  }, [familyId, overrides, refresh])

  return { overrides, assignmentHistory, participantHistory, loading, error, refresh, setMemberOverride }
}

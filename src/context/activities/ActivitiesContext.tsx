import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { useActivities, type Activity } from '../../hooks/useActivities'
import { activityInputToRow, type ActivityInput } from '../../domain/activities/types'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

export type { ActivityInput } from '../../domain/activities/types'

// A raw `activities` row has no `participant_ids` — that's a client-side
// join onto activity_participants (see useActivities.ts). A realtime INSERT
// defaults to no participants (the create RPC's activity_participants rows
// arrive as separate events right after and self-heal this via
// applyParticipantChange below); an UPDATE keeps whatever participants the
// entity already had rather than wiping them out.
function activityFromRealtimeRow(row: Record<string, unknown>, participantIds: string[]): Activity {
  return { ...row, participant_ids: participantIds } as unknown as Activity
}

// activity_participants is a pure join table: composite primary key
// (activity_id, member_id), no `id`/`family_id` columns — the generic
// id-keyed apply primitives don't fit, so participant add/remove patches
// the owning activity's participant_ids array directly.
function applyParticipantChange(activities: Activity[], row: Record<string, unknown>, action: 'add' | 'remove'): Activity[] {
  const activityId = row.activity_id as string
  const memberId = row.member_id as string
  return activities.map((activity) => {
    if (activity.id !== activityId) return activity
    if (action === 'add') {
      return activity.participant_ids.includes(memberId)
        ? activity
        : { ...activity, participant_ids: [...activity.participant_ids, memberId] }
    }
    return { ...activity, participant_ids: activity.participant_ids.filter((id) => id !== memberId) }
  })
}

interface ActivitiesContextValue {
  activities: Activity[]
  activitiesLoading: boolean
  activitiesError: string | null
  activitiesRealtimeStatus: RealtimeConnectionState
  addActivity: (input: ActivityInput) => Promise<void>
  updateActivity: (id: string, input: ActivityInput) => Promise<void>
  markActivityPaymentPaid: (id: string) => Promise<void>
  refreshActivities: () => Promise<void>
}

const ActivitiesContext = createContext<ActivitiesContextValue | null>(null)

interface ProviderProps {
  familyId: string
  children: ReactNode
}

export function ActivitiesProvider({ familyId, children }: ProviderProps) {
  const {
    activities,
    setActivities,
    loading: activitiesLoading,
    error: activitiesError,
    refresh: refreshActivities,
  } = useActivities(familyId)
  const [activitiesRealtimeStatus, setActivitiesRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:activities`,
      owner: 'ActivitiesProvider',
      openReason: 'provider-mount',
      onStatusChange: setActivitiesRealtimeStatus,
      tables: [
        {
          table: 'activities',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => setActivities((current) => applyRealtimeInsert(current, activityFromRealtimeRow(row, []))),
          onUpdate: (row) => setActivities((current) => {
            const existing = current.find((activity) => activity.id === row.id)
            return applyRealtimeUpdate(current, activityFromRealtimeRow(row, existing?.participant_ids ?? []))
          }),
          onDelete: (row) => setActivities((current) => applyRealtimeDelete(current, row.id as string)),
        },
        {
          // activity_participants has no id/family_id column (composite key
          // activity_id+member_id, scoped via the parent activity) — no
          // `filter`, RLS still limits delivery to this family's activities.
          table: 'activity_participants',
          onInsert: (row) => setActivities((current) => applyParticipantChange(current, row, 'add')),
          onDelete: (row) => setActivities((current) => applyParticipantChange(current, row, 'remove')),
        },
      ],
    })
    return unsubscribe
  }, [familyId, setActivities])

  const addActivity = useCallback(
    async (input: ActivityInput) => {
      const { error } = await supabase.rpc('create_activity_with_participants', {
        activity_data: { family_id: familyId, ...activityInputToRow(input) },
        participant_ids: input.participantIds,
      })
      if (error) throw friendly(error)
      await refreshActivities()
    },
    [familyId, refreshActivities]
  )

  const updateActivity = useCallback(
    async (id: string, input: ActivityInput) => {
      const { error } = await supabase.rpc('update_activity_with_participants', {
        target_activity_id: id,
        activity_data: activityInputToRow(input),
        participant_ids: input.participantIds,
      })
      if (error) throw friendly(error)
      await refreshActivities()
    },
    [refreshActivities]
  )

  const markActivityPaymentPaid = useCallback(async (id: string) => {
    const activity = activities.find((item) => item.id === id)
    if (!activity?.next_payment_due_date) return
    const { error } = await supabase.from('activities').update({ payment_paid_at: new Date().toISOString(), payment_paid_for_date: activity.next_payment_due_date }).eq('id', id).eq('family_id', familyId)
    if (error) throw friendly(error)
    await refreshActivities()
  }, [activities, familyId, refreshActivities])

  const value: ActivitiesContextValue = {
    activities,
    activitiesLoading,
    activitiesError,
    activitiesRealtimeStatus,
    addActivity,
    updateActivity,
    markActivityPaymentPaid,
    refreshActivities,
  }

  return <ActivitiesContext.Provider value={value}>{children}</ActivitiesContext.Provider>
}

export function useActivitiesData() {
  const ctx = useContext(ActivitiesContext)
  if (!ctx) throw new Error('useActivitiesData must be used within an ActivitiesProvider')
  return ctx
}

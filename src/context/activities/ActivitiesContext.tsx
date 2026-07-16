import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { useActivities, type Activity } from '../../hooks/useActivities'
import { activityInputToRow, type ActivityInput } from '../../domain/activities/types'

export type { ActivityInput } from '../../domain/activities/types'

interface ActivitiesContextValue {
  activities: Activity[]
  activitiesLoading: boolean
  activitiesError: string | null
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
    loading: activitiesLoading,
    error: activitiesError,
    refresh: refreshActivities,
  } = useActivities(familyId)

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

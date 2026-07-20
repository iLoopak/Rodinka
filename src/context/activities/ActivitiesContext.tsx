import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SupabaseActivitiesRepository } from '../../features/activities/data/supabaseActivitiesRepository'
import type { ActivitiesRepository, ActivityRealtimeChange } from '../../features/activities/data/activitiesRepository'
import type { Activity } from '../../features/activities/domain/activityTypes'
import type { ActivityInput } from '../../domain/activities/types'
import type { RealtimeConnectionState } from '../../realtime/connectionState'
import { t } from '../../strings'

export type { ActivityInput } from '../../domain/activities/types'

function upsertById(list: Activity[], record: Activity): Activity[] {
  const index = list.findIndex((entry) => entry.id === record.id)
  if (index === -1) return [...list, record]
  const next = [...list]
  next[index] = record
  return next
}

function applyChange(activities: Activity[], change: ActivityRealtimeChange): Activity[] {
  if (change.action === 'delete') return activities.filter((activity) => activity.id !== change.id)
  if (change.action === 'upsert') return upsertById(activities, change.record)
  return activities.map((activity) => {
    if (activity.id !== change.activityId) return activity
    if (change.action === 'participant-add') {
      return activity.participant_ids.includes(change.memberId)
        ? activity
        : { ...activity, participant_ids: [...activity.participant_ids, change.memberId] }
    }
    return { ...activity, participant_ids: activity.participant_ids.filter((id) => id !== change.memberId) }
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
  repository?: ActivitiesRepository
}

export function ActivitiesProvider({ familyId, children, repository: repositoryOverride }: ProviderProps) {
  const repository = useMemo(() => repositoryOverride ?? new SupabaseActivitiesRepository(), [repositoryOverride])
  const scope = useMemo(() => familyId ? { familyId } : null, [familyId])

  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [activitiesError, setActivitiesError] = useState<string | null>(null)
  const [activitiesRealtimeStatus, setActivitiesRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  // A realtime activities row carries no participants; patching one needs the
  // participants already on screen.
  const activitiesRef = useRef<Activity[]>([])
  activitiesRef.current = activities

  const refreshActivities = useCallback(async () => {
    if (!scope) { setActivities([]); setActivitiesLoading(false); return }
    setActivitiesLoading(true)
    try {
      setActivities(await repository.listActivities(scope))
      setActivitiesError(null)
    } catch (error) {
      console.error('Failed to load activities:', error instanceof Error ? error.message : 'unknown error')
      setActivities([])
      setActivitiesError(t.errors.loadFailed)
    }
    setActivitiesLoading(false)
  }, [repository, scope])

  useEffect(() => { void refreshActivities() }, [refreshActivities])

  useEffect(() => {
    if (!scope) return
    return repository.subscribe(scope, {
      onStatusChange: (status) => setActivitiesRealtimeStatus(status as RealtimeConnectionState),
      onActivityChange: (change) => setActivities((current) => applyChange(current, change)),
      resolveParticipants: (activityId) => activitiesRef.current.find((activity) => activity.id === activityId)?.participant_ids,
    })
  }, [repository, scope])

  // Each mutation returns the affected series, so it is merged in place. The
  // previous version reloaded every activity in the family after each one.
  const addActivity = useCallback(async (input: ActivityInput) => {
    if (!scope) return
    const created = await repository.createSeries(scope, input)
    setActivities((current) => upsertById(current, created))
  }, [repository, scope])

  const updateActivity = useCallback(async (id: string, input: ActivityInput) => {
    if (!scope) return
    const updated = await repository.updateSeries(scope, id, input)
    setActivities((current) => upsertById(current, updated))
  }, [repository, scope])

  const markActivityPaymentPaid = useCallback(async (id: string) => {
    if (!scope) return
    const dueDate = activitiesRef.current.find((activity) => activity.id === id)?.next_payment_due_date
    if (!dueDate) return
    const updated = await repository.markPaymentPaid(scope, id, dueDate)
    setActivities((current) => upsertById(current, updated))
  }, [repository, scope])

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

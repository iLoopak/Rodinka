import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActivityInput } from '../../domain/activities/types'
import { CalendarRepository } from '../../calendar/calendarRepository'
import { emptyCalendarData, type CalendarRepositorySnapshot } from '../../calendar/calendarTypes'
import { getOfflineLocalStore } from '../../shopping/shoppingIndexedDb'
import type { ChoreInput } from '../../utils/choreModel'
import { createMemberLookup } from '../../utils/memberLookup'
import { classifyStorageError, type AppErrorCode } from '../../errors/errorCodes'
import { adaptRepositorySync, publishFeatureSync, retireFeatureSync } from '../../sync/featureSyncRegistry'
import { useFamilyMembersData } from '../family/FamilyMembersContext'
import { useChoresData } from '../chores/ChoresContext'
import { useAllowanceData } from '../chores/AllowanceContext'
import { useActivitiesData } from '../activities/ActivitiesContext'
import { useOccurrenceAssignmentsData } from '../activities/OccurrenceAssignmentsContext'
import { useMedicalData } from '../health/MedicalContext'
import { useMealsDataContext } from '../meals/MealsContext'

const emptySnapshot: CalendarRepositorySnapshot = {
  ready: false,
  hasUsableData: false,
  data: emptyCalendarData(),
  mutations: [],
  pendingByLocalId: new Map(),
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing',
  lastSuccessfulSyncAt: null,
  error: null,
}

export function useCalendarOfflineDataSource(familyId: string, userId: string, currentMemberId: string) {
  const { allMembers, membersLoading, membersError } = useFamilyMembersData()
  const { chores, completions, choresLoading, choresError } = useChoresData()
  const { allowancePlans, allowancePlansLoading, allowancePlansError } = useAllowanceData()
  const { activities, activitiesLoading, activitiesError } = useActivitiesData()
  const {
    occurrenceOverrides, assignmentHistory, participantHistory,
    occurrenceAssignmentsLoading, occurrenceAssignmentsError,
  } = useOccurrenceAssignmentsData()
  const { medicalRecords, medicalLoading, medicalError } = useMedicalData()
  const { planEntries, planEntriesLoading, planEntriesError } = useMealsDataContext()
  const repositoryRef = useRef<CalendarRepository | null>(null)
  const [snapshot, setSnapshot] = useState<CalendarRepositorySnapshot>(emptySnapshot)

  useEffect(() => {
    let active = true
    const repository = new CalendarRepository({ familyId, userId, currentMemberId, store: getOfflineLocalStore() })
    repositoryRef.current = repository
    const unsubscribe = repository.subscribe((next) => { if (active) setSnapshot(next) })
    repository.start().catch((error) => {
      console.error('Failed to initialize offline calendar:', error)
      if (active) setSnapshot((current) => ({ ...current, ready: true, status: 'error', error: classifyStorageError(error) }))
    })
    return () => {
      active = false
      unsubscribe()
      void repository.stop()
      if (repositoryRef.current === repository) repositoryRef.current = null
    }
  }, [currentMemberId, familyId, userId])

  useEffect(() => {
    if (!snapshot.ready || !repositoryRef.current) return
    const update = {
      ...(!membersLoading && !membersError
        ? { members: allMembers.map((member) => ({ ...member, avatar_url: null })) }
        : {}),
      ...(!choresLoading && !choresError ? { chores, completions } : {}),
      ...(!activitiesLoading && !activitiesError ? { activities } : {}),
      ...(!medicalLoading && !medicalError ? { medicalRecords } : {}),
      ...(!planEntriesLoading && !planEntriesError ? { planEntries } : {}),
      ...(!allowancePlansLoading && !allowancePlansError ? { allowancePlans } : {}),
      ...(!occurrenceAssignmentsLoading && !occurrenceAssignmentsError
        ? { occurrenceOverrides, assignmentHistory, participantHistory }
        : {}),
    }
    repositoryRef.current.updateFromProviders(familyId, update)
  }, [
    activities, activitiesError, activitiesLoading, allowancePlans, allowancePlansError, allowancePlansLoading,
    allMembers, assignmentHistory, chores, choresError, choresLoading, completions, familyId,
    medicalError, medicalLoading, medicalRecords, membersError, membersLoading,
    occurrenceAssignmentsError, occurrenceAssignmentsLoading, occurrenceOverrides, participantHistory,
    planEntries, planEntriesError, planEntriesLoading, snapshot.ready,
  ])

  useEffect(() => {
    publishFeatureSync(adaptRepositorySync({
      feature: 'calendar',
      status: snapshot.status,
      pendingCount: snapshot.mutations.length,
      lastSyncedAt: snapshot.lastSuccessfulSyncAt,
      errorCode: snapshot.error as AppErrorCode | null,
    }))
    return () => retireFeatureSync('calendar')
  }, [snapshot.error, snapshot.lastSuccessfulSyncAt, snapshot.mutations.length, snapshot.status])

  const refreshCalendar = useCallback(async () => { await repositoryRef.current?.prioritizeReconciliation() }, [])
  const addOfflineChore = useCallback(async (input: ChoreInput) => {
    if (!repositoryRef.current) throw new Error('Calendar repository is not ready')
    await repositoryRef.current.addChore(input)
  }, [])
  const addOfflineActivity = useCallback(async (input: ActivityInput) => {
    if (!repositoryRef.current) throw new Error('Calendar repository is not ready')
    await repositoryRef.current.addActivity(input)
  }, [])
  const updatePendingCalendarRecord = useCallback(async (localId: string, input: ChoreInput | ActivityInput) => {
    if (!repositoryRef.current) throw new Error('Calendar repository is not ready')
    await repositoryRef.current.updatePending(localId, input)
  }, [])
  const retryCalendarRecord = useCallback(async (localId?: string) => {
    if (!repositoryRef.current) return
    await repositoryRef.current.retry(localId)
  }, [])
  const discardCalendarRecord = useCallback(async (localId: string) => {
    if (!repositoryRef.current) return
    await repositoryRef.current.discard(localId)
  }, [])
  const clearCalendarAccount = useCallback(async () => {
    await repositoryRef.current?.stop()
    await getOfflineLocalStore().clearCalendarUser(userId)
  }, [userId])

  const memberById = useMemo(() => createMemberLookup(snapshot.data.members), [snapshot.data.members])
  const latestCompletionFor = useMemo(() => {
    return (choreId: string) => snapshot.data.completions.find((completion) => completion.chore_id === choreId) ?? null
  }, [snapshot.data.completions])

  return {
    ...snapshot.data,
    memberById,
    latestCompletionFor,
    calendarLoading: !snapshot.ready,
    calendarHasUsableData: snapshot.hasUsableData,
    calendarError: snapshot.ready && !snapshot.hasUsableData && (snapshot.status === 'error' || snapshot.status === 'offline') ? 'calendar-unavailable' : null,
    calendarSyncStatus: snapshot.status,
    calendarSyncError: snapshot.error,
    calendarLastSyncedAt: snapshot.lastSuccessfulSyncAt,
    pendingCalendarChanges: snapshot.mutations.length,
    pendingCalendarRecords: snapshot.pendingByLocalId,
    refreshCalendar,
    addOfflineChore,
    addOfflineActivity,
    updatePendingCalendarRecord,
    retryCalendarRecord,
    discardCalendarRecord,
    clearCalendarAccount,
  }
}

type CalendarOfflineContextValue = ReturnType<typeof useCalendarOfflineDataSource>
const CalendarOfflineContext = createContext<CalendarOfflineContextValue | null>(null)
const CalendarSyncStatusContext = createContext<CalendarOfflineContextValue['calendarSyncStatus'] | null>(null)

interface ProviderProps {
  familyId: string
  userId: string
  currentMemberId: string
  children: ReactNode
}

export function CalendarOfflineProvider({ familyId, userId, currentMemberId, children }: ProviderProps) {
  const value = useCalendarOfflineDataSource(familyId, userId, currentMemberId)
  return (
    <CalendarSyncStatusContext.Provider value={value.calendarSyncStatus}>
      <CalendarOfflineContext.Provider value={value}>{children}</CalendarOfflineContext.Provider>
    </CalendarSyncStatusContext.Provider>
  )
}

export function useCalendarOffline() {
  const context = useContext(CalendarOfflineContext)
  if (!context) throw new Error('useCalendarOffline must be used within a CalendarOfflineProvider')
  return context
}

export function useCalendarSyncStatus() {
  const status = useContext(CalendarSyncStatusContext)
  if (status === null) throw new Error('useCalendarSyncStatus must be used within a CalendarOfflineProvider')
  return status
}

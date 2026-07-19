import { useCallback } from 'react'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useFamilySettings } from '../../context/family/FamilySettingsContext'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useAllowanceData } from '../../context/chores/AllowanceContext'
import { useChoreApprovalActions } from '../../context/chores/useChoreApprovalActions'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useMedicalData } from '../../context/health/MedicalContext'
import { useMealsDataContext } from '../../context/meals/MealsContext'
import { useShopping } from '../../context/shopping/ShoppingContext'
import { useCalendarOffline } from '../../context/calendar/CalendarOfflineContext'
import { useOccurrenceAssignmentsData } from '../../context/activities/OccurrenceAssignmentsContext'

// Composes every feature context Today's dashboard actually renders. The
// page shell (header/greeting/quick-todo widget) only needs identity +
// members + chores, so `loading`/`error` gate on just those — activities,
// medical, meals, allowance and shopping populate progressively as their
// own contexts finish loading, and a failure in any one of them degrades
// to an empty section instead of blocking the whole dashboard.
export function useTodayDashboardData() {
  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const { members, memberById } = useFamilyMembersData()
  const { familyHeroImageUrl } = useFamilySettings()
  const {
    chores, completions, pendingCompletions, latestCompletionFor,
    choresLoading, choresError, addChore, updateChore, setChoreArchived, reject,
    refreshChores, refreshCompletions,
  } = useChoresData()
  const { approve, markDone } = useChoreApprovalActions()
  const { activities, refreshActivities } = useActivitiesData()
  const { occurrenceOverrides, assignmentHistory, participantHistory, refreshOccurrenceAssignments } = useOccurrenceAssignmentsData()
  const { medicalRecords, refreshMedicalRecords } = useMedicalData()
  const { voteRounds, planEntries, refreshMealsData } = useMealsDataContext()
  const { allowancePlans, allowanceCycles, refreshLedger, refreshAllowancePlans } = useAllowanceData()
  const { activeShoppingItems, addShoppingItem, refreshShopping, shoppingLoading, shoppingHasUsableData, shoppingSyncStatus, shoppingLastSyncedAt, pendingShoppingChanges } = useShopping()
  const calendar = useCalendarOffline()
  const useOfflineCalendarSnapshot = calendar.calendarHasUsableData && (calendar.calendarSyncStatus === 'offline' || choresError !== null && chores.length === 0)

  const displayChores = useOfflineCalendarSnapshot ? calendar.chores : chores
  const displayCompletions = useOfflineCalendarSnapshot ? calendar.completions : completions
  const displayActivities = useOfflineCalendarSnapshot ? calendar.activities : activities
  const displayMedicalRecords = useOfflineCalendarSnapshot ? calendar.medicalRecords : medicalRecords
  const displayPlanEntries = useOfflineCalendarSnapshot ? calendar.planEntries : planEntries
  const displayAllowancePlans = useOfflineCalendarSnapshot ? calendar.allowancePlans : allowancePlans
  const displayOccurrenceOverrides = useOfflineCalendarSnapshot ? calendar.occurrenceOverrides : occurrenceOverrides
  const displayAssignmentHistory = useOfflineCalendarSnapshot ? calendar.assignmentHistory : assignmentHistory
  const displayParticipantHistory = useOfflineCalendarSnapshot ? calendar.participantHistory : participantHistory
  const displayMembers = useOfflineCalendarSnapshot && calendar.members.length > 0 ? calendar.members : members
  const displayLatestCompletionFor = useOfflineCalendarSnapshot ? calendar.latestCompletionFor : latestCompletionFor
  const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const offlineShellReady = browserOffline && (calendar.calendarHasUsableData || shoppingHasUsableData || calendar.calendarSyncStatus === 'offline')
  const loading = useOfflineCalendarSnapshot || offlineShellReady ? false : choresLoading
  const error = useOfflineCalendarSnapshot || offlineShellReady ? null : choresError

  const refresh = useCallback(async () => {
    await Promise.all([
      refreshChores(),
      refreshCompletions(),
      refreshActivities(),
      refreshOccurrenceAssignments(),
      refreshMedicalRecords(),
      refreshMealsData(),
      refreshLedger(),
      refreshAllowancePlans(),
      refreshShopping(),
      calendar.refreshCalendar(),
    ])
  }, [refreshChores, refreshCompletions, refreshActivities, refreshOccurrenceAssignments, refreshMedicalRecords, refreshMealsData, refreshLedger, refreshAllowancePlans, refreshShopping, calendar])

  return {
    currentMember,
    isParentOrAdmin,
    members: displayMembers,
    kids: displayMembers.filter((member) => member.role === 'child'),
    chores: displayChores,
    activities: displayActivities,
    occurrenceOverrides: displayOccurrenceOverrides,
    assignmentHistory: displayAssignmentHistory,
    participantHistory: displayParticipantHistory,
    medicalRecords: displayMedicalRecords,
    planEntries: displayPlanEntries,
    allowancePlans: displayAllowancePlans,
    allowanceCycles,
    completions: displayCompletions,
    voteRounds,
    pendingCompletions,
    activeShoppingItems,
    shoppingLoading,
    shoppingHasUsableData,
    shoppingSyncStatus,
    shoppingLastSyncedAt,
    pendingShoppingChanges,
    calendarSyncStatus: calendar.calendarSyncStatus,
    calendarLastSyncedAt: calendar.calendarLastSyncedAt,
    pendingCalendarChanges: calendar.pendingCalendarChanges,
    hasOfflineCalendarSnapshot: calendar.calendarHasUsableData,
    usingOfflineCalendarSnapshot: useOfflineCalendarSnapshot,
    familyHeroImageUrl,
    addChore: useOfflineCalendarSnapshot ? calendar.addOfflineChore : addChore,
    updateChore,
    setChoreArchived,
    addShoppingItem,
    memberById: useOfflineCalendarSnapshot ? calendar.memberById : memberById,
    latestCompletionFor: displayLatestCompletionFor,
    markDone,
    approve,
    reject,
    loading,
    error,
    refresh,
  }
}

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
import { useOccurrenceAssignmentsData } from '../../context/activities/OccurrenceAssignmentsContext'

// Composes every feature context Today's dashboard actually renders. The
// page shell (header/greeting/quick-todo widget) only needs identity +
// members + chores, so `loading`/`error` gate on just those — activities,
// medical, meals, allowance and shopping populate progressively as their
// own contexts finish loading, and a failure in any one of them degrades
// to an empty section instead of blocking the whole dashboard.
export function useTodayDashboardData() {
  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const { members, kids, memberById } = useFamilyMembersData()
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
  const { activeShoppingItems, addShoppingItem, refreshShopping, shoppingLoading, shoppingHasUsableData, shoppingSyncStatus } = useShopping()

  const loading = choresLoading
  const error = choresError

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
    ])
  }, [refreshChores, refreshCompletions, refreshActivities, refreshOccurrenceAssignments, refreshMedicalRecords, refreshMealsData, refreshLedger, refreshAllowancePlans, refreshShopping])

  return {
    currentMember,
    isParentOrAdmin,
    members,
    kids,
    chores,
    activities,
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    medicalRecords,
    planEntries,
    allowancePlans,
    allowanceCycles,
    completions,
    voteRounds,
    pendingCompletions,
    activeShoppingItems,
    shoppingLoading,
    shoppingHasUsableData,
    shoppingSyncStatus,
    familyHeroImageUrl,
    addChore,
    updateChore,
    setChoreArchived,
    addShoppingItem,
    memberById,
    latestCompletionFor,
    markDone,
    approve,
    reject,
    loading,
    error,
    refresh,
  }
}

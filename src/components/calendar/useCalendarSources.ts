import { useCallback } from 'react'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useAllowanceData } from '../../context/chores/AllowanceContext'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useOccurrenceAssignmentsData } from '../../context/activities/OccurrenceAssignmentsContext'
import { useMedicalData } from '../../context/health/MedicalContext'
import { useMealsDataContext } from '../../context/meals/MealsContext'

// Everything buildCalendarEntries() needs, composed from the split feature
// contexts. Calendar waits only on these sources — never on shopping or any
// domain it doesn't actually project onto the grid/agenda.
export function useCalendarSources() {
  const { members, memberById } = useFamilyMembersData()
  const { chores, latestCompletionFor, choresLoading, choresError, refreshChores } = useChoresData()
  const { allowancePlans, allowanceLoading, allowanceError, refreshAllowancePlans } = useAllowanceData()
  const { activities, activitiesLoading, activitiesError, refreshActivities } = useActivitiesData()
  const {
    occurrenceOverrides, assignmentHistory, participantHistory,
    occurrenceAssignmentsLoading, occurrenceAssignmentsError, refreshOccurrenceAssignments,
  } = useOccurrenceAssignmentsData()
  const { medicalRecords, medicalLoading, medicalError, refreshMedicalRecords } = useMedicalData()
  const { planEntries, loading: mealsLoading, error: mealsError, refreshMealsData } = useMealsDataContext()

  const loading = choresLoading || allowanceLoading || activitiesLoading || occurrenceAssignmentsLoading || medicalLoading || mealsLoading
  const error = choresError || allowanceError || activitiesError || occurrenceAssignmentsError || medicalError || mealsError

  const refresh = useCallback(async () => {
    await Promise.all([
      refreshChores(),
      refreshAllowancePlans(),
      refreshActivities(),
      refreshOccurrenceAssignments(),
      refreshMedicalRecords(),
      refreshMealsData(),
    ])
  }, [refreshChores, refreshAllowancePlans, refreshActivities, refreshOccurrenceAssignments, refreshMedicalRecords, refreshMealsData])

  return {
    chores,
    activities,
    medicalRecords,
    planEntries,
    allowancePlans,
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    members,
    memberById,
    latestCompletionFor,
    loading,
    error,
    refresh,
  }
}

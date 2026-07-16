import { useCallback, useMemo } from 'react'
import { useFamilyCore } from '../family/FamilyCoreContext'
import { useFamilyMembersData } from '../family/FamilyMembersContext'
import { useChoresData } from '../chores/ChoresContext'
import { useActivitiesData } from '../activities/ActivitiesContext'
import { useOccurrenceAssignmentsData } from '../activities/OccurrenceAssignmentsContext'
import { useMedicalData } from '../health/MedicalContext'
import { useMealsDataContext } from '../meals/MealsContext'
import { useShopping } from '../shopping/ShoppingContext'
import { buildReminderSourceFingerprint } from '../../notifications/reminderLifecycle'
import { generateReminderDrafts, type GenerateReminderInput } from '../../notifications/reminders'

// Everything ReminderContext needs, composed from the split feature contexts
// instead of one monolithic useFamilyData(). Reminders legitimately touch
// every domain, so this hook exists precisely to keep that fan-out in one
// place instead of ReminderContext importing 8 contexts directly.
export function useReminderSources() {
  const { familyId, currentMember, isParentOrAdmin } = useFamilyCore()
  const { members } = useFamilyMembersData()
  const { chores, completions, pendingCompletions, latestCompletionFor, choresLoading, refreshChores, refreshCompletions } = useChoresData()
  const { activities, activitiesLoading, refreshActivities } = useActivitiesData()
  const { occurrenceOverrides, assignmentHistory, occurrenceAssignmentsLoading, refreshOccurrenceAssignments } = useOccurrenceAssignmentsData()
  const { medicalRecords, medicalLoading, refreshMedicalRecords } = useMedicalData()
  const { voteRounds, planEntries, loading: mealsLoading, refreshMealsData } = useMealsDataContext()
  const { shoppingItems, shoppingLoading, refreshShopping } = useShopping()

  const loading =
    choresLoading ||
    activitiesLoading ||
    occurrenceAssignmentsLoading ||
    medicalLoading ||
    mealsLoading ||
    shoppingLoading

  const fingerprint = useMemo(() => buildReminderSourceFingerprint({
    members, chores, completions, activities,
    medicalRecords, voteRounds,
    planEntries, shoppingItems,
    occurrenceOverrides, assignmentHistory,
  }), [members, chores, completions, activities, medicalRecords, voteRounds, planEntries, shoppingItems, occurrenceOverrides, assignmentHistory])

  const draftInputs: Omit<GenerateReminderInput, 'preferences' | 'copy' | 'now'> = useMemo(() => ({
    familyId, currentMember, isParentOrAdmin,
    members, chores, latestCompletionFor,
    activities, medicalRecords, voteRounds,
    occurrenceOverrides, assignmentHistory,
    planEntries, pendingCompletions, shoppingItems,
  }), [familyId, currentMember, isParentOrAdmin, members, chores, latestCompletionFor, activities, medicalRecords, voteRounds, occurrenceOverrides, assignmentHistory, planEntries, pendingCompletions, shoppingItems])

  const refresh = useCallback(async () => {
    await Promise.all([
      refreshChores(),
      refreshCompletions(),
      refreshActivities(),
      refreshOccurrenceAssignments(),
      refreshMedicalRecords(),
      refreshMealsData(),
      refreshShopping(),
    ])
  }, [refreshChores, refreshCompletions, refreshActivities, refreshOccurrenceAssignments, refreshMedicalRecords, refreshMealsData, refreshShopping])

  return { loading, fingerprint, draftInputs, generateReminderDrafts, refresh }
}

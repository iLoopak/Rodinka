import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { useChoresData } from '../context/chores/ChoresContext'
import { useAllowanceData } from '../context/chores/AllowanceContext'
import { useActivitiesData } from '../context/activities/ActivitiesContext'
import { useOccurrenceAssignmentsData } from '../context/activities/OccurrenceAssignmentsContext'
import { useMedicalData } from '../context/health/MedicalContext'
import { useMealsDataContext } from '../context/meals/MealsContext'
import { useMessagesData } from '../context/messages/MessagesContext'
import { worstConnectionState, type RealtimeConnectionState } from '../realtime/connectionState'

// A single app-wide "is realtime healthy" signal, composed from every
// always-mounted feature context's own status — not a new context, just a
// selector over the ones that already exist (same shape as
// useTodayDashboardData/useCalendarSources). Picks the single worst state
// so one flaky subscription doesn't get lost among seven healthy ones.
export function useRealtimeStatus(): RealtimeConnectionState {
  const { membersRealtimeStatus } = useFamilyMembersData()
  const { settingsRealtimeStatus } = useFamilySettings()
  const { choresRealtimeStatus } = useChoresData()
  const { allowanceRealtimeStatus } = useAllowanceData()
  const { activitiesRealtimeStatus } = useActivitiesData()
  const { occurrenceAssignmentsRealtimeStatus } = useOccurrenceAssignmentsData()
  const { medicalRealtimeStatus } = useMedicalData()
  const { mealsRealtimeStatus } = useMealsDataContext()
  const { messagesRealtimeStatus } = useMessagesData()

  return worstConnectionState([
    membersRealtimeStatus,
    settingsRealtimeStatus,
    choresRealtimeStatus,
    allowanceRealtimeStatus,
    activitiesRealtimeStatus,
    occurrenceAssignmentsRealtimeStatus,
    medicalRealtimeStatus,
    mealsRealtimeStatus,
    messagesRealtimeStatus,
  ])
}

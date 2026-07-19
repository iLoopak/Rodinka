import { useCalendarOffline } from '../../context/calendar/CalendarOfflineContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'

// Everything buildCalendarEntries() needs comes from the persisted calendar
// snapshot. Signed avatar URLs remain a live-only concern, so online member
// rows replace the cached initials-only copies when they are available.
export function useCalendarSources() {
  const calendar = useCalendarOffline()
  const liveMembers = useFamilyMembersData()
  const members = liveMembers.members.length > 0 ? liveMembers.members : calendar.members
  const memberById = liveMembers.members.length > 0 ? liveMembers.memberById : calendar.memberById

  return {
    ...calendar,
    members,
    memberById,
    loading: calendar.calendarLoading,
    error: calendar.calendarError,
    refresh: calendar.refreshCalendar,
  }
}

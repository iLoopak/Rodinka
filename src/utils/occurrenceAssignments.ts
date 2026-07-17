export type OccurrenceSeriesType = 'activity' | 'task'

export interface OccurrenceOverride {
  id: string
  family_id: string
  series_type: OccurrenceSeriesType
  series_id: string
  occurrence_date: string
  companion_member_id: string | null
  assignee_member_id: string | null
  cancelled: boolean
  updated_at: string
}

export interface SeriesAssignmentHistory {
  id: string
  family_id: string
  series_type: OccurrenceSeriesType
  series_id: string
  effective_from: string
  member_id: string | null
}

export interface ActivityParticipantHistory {
  id: string
  family_id: string
  activity_id: string
  member_id: string | null
  effective_from: string
  effective_to: string | null
}

export function getEffectiveActivityParticipants(activityId: string, occurrenceDate: string, currentParticipantIds: string[], history: ActivityParticipantHistory[]) {
  const activityHistory = history.filter((item) => item.activity_id === activityId)
  if (activityHistory.length === 0) return currentParticipantIds
  return activityHistory
    .filter((item) => item.effective_from <= occurrenceDate && (!item.effective_to || item.effective_to >= occurrenceDate))
    .flatMap((item) => item.member_id ? [item.member_id] : [])
}

export interface EffectiveOccurrenceMember {
  memberId: string | null
  isOverride: boolean
  overrideId: string | null
}

export function getEffectiveOccurrenceMember(input: {
  seriesType: OccurrenceSeriesType
  seriesId: string
  occurrenceDate: string
  defaultMemberId: string | null
  overrides: OccurrenceOverride[]
  assignmentHistory?: SeriesAssignmentHistory[]
}): EffectiveOccurrenceMember {
  const override = input.overrides.find((item) =>
    item.series_type === input.seriesType &&
    item.series_id === input.seriesId &&
    item.occurrence_date === input.occurrenceDate
  )
  if (override) {
    return {
      memberId: input.seriesType === 'activity' ? override.companion_member_id : override.assignee_member_id,
      isOverride: true,
      overrideId: override.id,
    }
  }

  const historical = (input.assignmentHistory ?? [])
    .filter((item) => item.series_type === input.seriesType && item.series_id === input.seriesId && item.effective_from <= input.occurrenceDate)
    .sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0]

  return { memberId: historical ? historical.member_id : input.defaultMemberId, isOverride: false, overrideId: null }
}

export function eligibleOccurrenceMembers<T extends { status?: string; role: string }>(members: T[], seriesType: OccurrenceSeriesType) {
  return members.filter((member) => (member.status ?? 'active') === 'active' && (seriesType === 'task' || member.role === 'admin' || member.role === 'parent'))
}

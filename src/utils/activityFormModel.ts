import type { Activity, ActivityCategory, ActivityKind, ActivityRecurrenceType } from '../features/activities/domain/activityTypes'
import { toUTCDate } from './dueDate'

export function defaultActivityCategory(kind: ActivityKind): ActivityCategory {
  return kind === 'event' ? 'other_event' : 'other'
}

export function activityHasContact(activity: Pick<Activity, 'coach_name' | 'coach_phone' | 'coach_email'>): boolean {
  return Boolean(activity.coach_name || activity.coach_phone || activity.coach_email)
}

export function activityHasPayment(activity: Pick<Activity, 'payment_amount' | 'payment_frequency' | 'next_payment_due_date'>): boolean {
  return activity.payment_amount != null || Boolean(activity.payment_frequency || activity.next_payment_due_date)
}

export function activityHasAdvancedDetails(activity: Activity): boolean {
  return activity.category !== defaultActivityCategory(activity.kind)
    || Boolean(activity.skill_level)
    || Boolean(activity.responsible_member_id || activity.secondary_responsible_member_id)
    || activityHasContact(activity)
    || activityHasPayment(activity)
    || activity.reminder_enabled
    || Boolean(activity.notes)
    || activity.status !== 'active'
}

export function toggleMemberSelection(selectedIds: string[], memberId: string): string[] {
  return selectedIds.includes(memberId)
    ? selectedIds.filter((id) => id !== memberId)
    : [...selectedIds, memberId]
}

export function selectWholeFamily(memberIds: string[]): string[] {
  return [...new Set(memberIds)]
}

export function isoWeekday(date: string): number {
  if (!date) return 1
  const day = toUTCDate(date).getUTCDay()
  return day === 0 ? 7 : day
}

export function selectedRecurrenceWeekdays(
  recurrenceType: ActivityRecurrenceType,
  startDate: string,
  weekdays: number[]
): number[] {
  if (recurrenceType === 'weekly' || recurrenceType === 'biweekly') return [isoWeekday(startDate)]
  if (recurrenceType === 'custom_weekdays') return [...weekdays].sort()
  return []
}

export function toggleRecurrenceWeekday(selected: number[], day: number): number[] {
  return selected.includes(day)
    ? selected.filter((value) => value !== day)
    : [...selected, day].sort()
}

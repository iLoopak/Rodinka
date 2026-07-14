import { t } from '../strings'
import type {
  ActivityCategory,
  ActivityPaymentFrequency,
  ActivityRecurrenceType,
  ActivityStatus,
} from '../hooks/useActivities'

export const ACTIVITY_CATEGORY_VALUES: ActivityCategory[] = [
  'swimming',
  'dance',
  'football',
  'music',
  'speech_therapy',
  'club',
  'camp',
  'after_school',
  'other',
  'vacation',
  'trip',
  'celebration',
  'family_visit',
  'other_event',
]

export function activityCategoryLabel(category: ActivityCategory): string {
  const labels: Record<ActivityCategory, string> = {
    swimming: t.activities.categorySwimming,
    dance: t.activities.categoryDance,
    football: t.activities.categoryFootball,
    music: t.activities.categoryMusic,
    speech_therapy: t.activities.categorySpeechTherapy,
    club: t.activities.categoryClub,
    camp: t.activities.categoryCamp,
    after_school: t.activities.categoryAfterSchool,
    other: t.activities.categoryOther,
    vacation: t.activities.categoryVacation,
    trip: t.activities.categoryTrip,
    celebration: t.activities.categoryCelebration,
    family_visit: t.activities.categoryFamilyVisit,
    other_event: t.activities.categoryOtherEvent,
  }
  return labels[category]
}

export const ACTIVITY_RECURRENCE_VALUES: ActivityRecurrenceType[] = [
  'one_off',
  'weekly',
  'biweekly',
  'custom_weekdays',
]

export function activityRecurrenceLabel(type: ActivityRecurrenceType): string {
  const labels: Record<ActivityRecurrenceType, string> = {
    one_off: t.activities.recurrenceOneOff,
    weekly: t.activities.recurrenceWeekly,
    biweekly: t.activities.recurrenceBiweekly,
    custom_weekdays: t.activities.recurrenceCustomWeekdays,
  }
  return labels[type]
}

export const ACTIVITY_PAYMENT_FREQUENCY_VALUES: ActivityPaymentFrequency[] = [
  'one_time',
  'weekly',
  'monthly',
  'term',
  'yearly',
]

export function activityPaymentFrequencyLabel(frequency: ActivityPaymentFrequency): string {
  const labels: Record<ActivityPaymentFrequency, string> = {
    one_time: t.activities.paymentOneTime,
    weekly: t.activities.paymentWeekly,
    monthly: t.activities.paymentMonthly,
    term: t.activities.paymentTerm,
    yearly: t.activities.paymentYearly,
  }
  return labels[frequency]
}

export const ACTIVITY_STATUS_VALUES: ActivityStatus[] = ['active', 'paused', 'finished']

export function activityStatusLabel(status: ActivityStatus): string {
  const labels: Record<ActivityStatus, string> = {
    active: t.activities.statusActive,
    paused: t.activities.statusPaused,
    finished: t.activities.statusFinished,
  }
  return labels[status]
}

const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 7] as const

export function activityWeekdayLabel(weekday: number): string {
  const labels: Record<number, string> = {
    1: t.activities.weekdayMon,
    2: t.activities.weekdayTue,
    3: t.activities.weekdayWed,
    4: t.activities.weekdayThu,
    5: t.activities.weekdayFri,
    6: t.activities.weekdaySat,
    7: t.activities.weekdaySun,
  }
  return labels[weekday] ?? '?'
}

export function activityWeekdayOptions(): { value: number; label: string }[] {
  return WEEKDAY_VALUES.map((value) => ({ value, label: activityWeekdayLabel(value) }))
}

export function activityWeekdaysSummary(weekdays: number[] | null): string {
  if (!weekdays || weekdays.length === 0) return ''
  return [...weekdays].sort().map(activityWeekdayLabel).join(', ')
}

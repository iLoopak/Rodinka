import type {
  ActivityCategory,
  ActivityKind,
  ActivityPaymentFrequency,
  ActivityRecurrenceType,
  ActivityStatus,
} from '../../hooks/useActivities'

export interface ActivityInput {
  title: string
  category: ActivityCategory
  kind: ActivityKind
  allDay: boolean
  participantIds: string[]
  responsibleMemberId: string | null
  secondaryResponsibleMemberId: string | null
  location: string
  coachName: string
  coachPhone: string
  coachEmail: string
  notes: string
  skillLevel: string
  startDate: string
  endDate: string | null
  recurrenceType: ActivityRecurrenceType
  recurrenceWeekdays: number[] | null
  startTime: string | null
  endTime: string | null
  paymentAmount: number | null
  paymentFrequency: ActivityPaymentFrequency | null
  nextPaymentDueDate: string | null
  status: ActivityStatus
  reminderEnabled: boolean
  reminderDaysBefore: number | null
}

export function activityInputToRow(input: ActivityInput) {
  return {
    title: input.title,
    category: input.category,
    kind: input.kind,
    all_day: input.allDay,
    responsible_member_id: input.responsibleMemberId,
    secondary_responsible_member_id: input.secondaryResponsibleMemberId,
    location: input.location || null,
    coach_name: input.coachName || null,
    coach_phone: input.coachPhone || null,
    coach_email: input.coachEmail || null,
    notes: input.notes || null,
    skill_level: input.skillLevel || null,
    start_date: input.startDate,
    end_date: input.endDate,
    recurrence_type: input.recurrenceType,
    recurrence_weekdays: input.recurrenceWeekdays,
    start_time: input.startTime,
    end_time: input.endTime,
    payment_amount: input.paymentAmount,
    payment_frequency: input.paymentFrequency,
    next_payment_due_date: input.nextPaymentDueDate,
    status: input.status,
    reminder_enabled: input.reminderEnabled,
    reminder_days_before: input.reminderDaysBefore,
  }
}

export const CHORE_RECURRENCE_TYPES = ['none', 'daily', 'weekly', 'monthly'] as const

export type ChoreRecurrenceType = (typeof CHORE_RECURRENCE_TYPES)[number]
export type ChoreStatus = 'active' | 'archived'

export interface Chore {
  id: string
  family_id: string
  title: string
  description: string | null
  assigned_to: string
  due_date: string
  reward_amount: number
  recurring: boolean
  recurrence_type: ChoreRecurrenceType
  recurrence_weekdays: number[] | null
  preferred_day_of_month: number | null
  status: ChoreStatus
  created_at: string
  updated_at: string
}

export interface ChoreInput {
  title: string
  description: string
  assignedTo: string
  dueDate: string
  rewardAmount: number
  recurrenceType: ChoreRecurrenceType
  recurrenceWeekdays: number[] | null
  preferredDayOfMonth: number | null
}

interface ChoreRow {
  id: string
  family_id: string
  title: string
  description: string | null
  assigned_to: string
  due_date: string
  reward_amount: number
  recurring?: boolean | null
  recurrence_type?: string | null
  recurrence_weekdays?: number[] | null
  preferred_day_of_month?: number | null
  status?: string | null
  created_at: string
  updated_at?: string | null
}

function isRecurrenceType(value: string | null | undefined): value is ChoreRecurrenceType {
  return CHORE_RECURRENCE_TYPES.some((item) => item === value)
}

function validWeekdays(values: number[] | null | undefined): number[] | null {
  if (!values) return null
  const normalized = [...new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 7))]
    .sort((a, b) => a - b)
  return normalized.length > 0 ? normalized : null
}

function dueDateDay(dueDate: string): number {
  const day = Number(dueDate.slice(8, 10))
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1
}

// Keeps the UI resilient while a legacy record is being migrated. The old
// boolean did not contain a cadence, so recurring=true maps to the least
// surprising structured default: weekly on the existing due-date weekday.
export function normalizeChore(row: ChoreRow): Chore {
  const recurrenceType = isRecurrenceType(row.recurrence_type)
    ? row.recurrence_type
    : row.recurring
      ? 'weekly'
      : 'none'
  const weekdays = recurrenceType === 'daily'
    ? validWeekdays(row.recurrence_weekdays) ?? [1, 2, 3, 4, 5, 6, 7]
    : null
  const preferredDay = recurrenceType === 'monthly'
    ? row.preferred_day_of_month && row.preferred_day_of_month >= 1 && row.preferred_day_of_month <= 31
      ? row.preferred_day_of_month
      : dueDateDay(row.due_date)
    : null

  return {
    ...row,
    reward_amount: Number(row.reward_amount),
    recurring: recurrenceType !== 'none',
    recurrence_type: recurrenceType,
    recurrence_weekdays: weekdays,
    preferred_day_of_month: preferredDay,
    status: row.status === 'archived' ? 'archived' : 'active',
    updated_at: row.updated_at ?? row.created_at,
  }
}

export function choreInputToRow(input: ChoreInput) {
  return {
    title: input.title.trim(),
    description: input.description.trim() || null,
    assigned_to: input.assignedTo,
    due_date: input.dueDate,
    reward_amount: input.rewardAmount,
    recurring: input.recurrenceType !== 'none',
    recurrence_type: input.recurrenceType,
    recurrence_weekdays: input.recurrenceType === 'daily' ? input.recurrenceWeekdays : null,
    preferred_day_of_month: input.recurrenceType === 'monthly' ? input.preferredDayOfMonth : null,
  }
}

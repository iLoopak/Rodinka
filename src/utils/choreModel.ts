export const CHORE_RECURRENCE_TYPES = ['none', 'daily', 'weekly', 'monthly'] as const

export type ChoreRecurrenceType = (typeof CHORE_RECURRENCE_TYPES)[number]
export type ChoreStatus = 'active' | 'archived'
export const TASK_CATEGORIES = ['household', 'children', 'shopping', 'maintenance', 'administration', 'preparation', 'other'] as const
export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface Chore {
  id: string
  family_id: string
  title: string
  description: string | null
  assigned_to: string | null
  due_date: string | null
  reward_amount: number
  reward_enabled: boolean
  reward_currency: string
  requires_approval: boolean
  category: TaskCategory | null
  priority: TaskPriority | null
  recurring: boolean
  recurrence_type: ChoreRecurrenceType
  recurrence_weekdays: number[] | null
  preferred_day_of_month: number | null
  status: ChoreStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ChoreInput {
  title: string
  description: string
  assignedTo: string | null
  dueDate: string | null
  rewardAmount: number
  rewardEnabled?: boolean
  rewardCurrency?: string
  requiresApproval?: boolean
  category?: TaskCategory | null
  priority?: TaskPriority | null
  recurrenceType: ChoreRecurrenceType
  recurrenceWeekdays: number[] | null
  preferredDayOfMonth: number | null
}

interface ChoreRow {
  id: string
  family_id: string
  title: string
  description: string | null
  assigned_to: string | null
  due_date: string | null
  reward_amount: number
  reward_enabled?: boolean | null
  reward_currency?: string | null
  requires_approval?: boolean | null
  category?: string | null
  priority?: string | null
  recurring?: boolean | null
  recurrence_type?: string | null
  recurrence_weekdays?: number[] | null
  preferred_day_of_month?: number | null
  status?: string | null
  sort_order?: number | null
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

function dueDateDay(dueDate: string | null): number {
  if (!dueDate) return 1
  const day = Number(dueDate.slice(8, 10))
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1
}

// Keeps the UI resilient while a legacy record is being migrated. The old
// boolean did not contain a cadence, so recurring=true maps to the least
// surprising structured default: weekly on the existing due-date weekday.
export function normalizeChore(row: ChoreRow): Chore {
  const recurrenceType = row.due_date && isRecurrenceType(row.recurrence_type)
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
    reward_enabled: row.reward_enabled ?? Number(row.reward_amount) > 0,
    reward_currency: row.reward_currency ?? 'CZK',
    requires_approval: row.requires_approval ?? true,
    category: TASK_CATEGORIES.includes(row.category as TaskCategory) ? row.category as TaskCategory : null,
    priority: TASK_PRIORITIES.includes(row.priority as TaskPriority) ? row.priority as TaskPriority : null,
    recurring: recurrenceType !== 'none',
    recurrence_type: recurrenceType,
    recurrence_weekdays: weekdays,
    preferred_day_of_month: preferredDay,
    status: row.status === 'archived' ? 'archived' : 'active',
    sort_order: Number(row.sort_order ?? 0),
    updated_at: row.updated_at ?? row.created_at,
  }
}

export function choreInputToRow(input: ChoreInput) {
  return {
    title: input.title.trim(),
    description: input.description.trim() || null,
    assigned_to: input.assignedTo,
    due_date: input.dueDate,
    reward_amount: (input.rewardEnabled ?? input.rewardAmount > 0) ? input.rewardAmount : 0,
    reward_enabled: input.rewardEnabled ?? input.rewardAmount > 0,
    reward_currency: input.rewardCurrency ?? 'CZK',
    requires_approval: input.requiresApproval ?? true,
    category: input.category ?? null,
    priority: input.priority ?? 'normal',
    recurring: Boolean(input.dueDate) && input.recurrenceType !== 'none',
    recurrence_type: input.dueDate ? input.recurrenceType : 'none',
    recurrence_weekdays: input.dueDate && input.recurrenceType === 'daily' ? input.recurrenceWeekdays : null,
    preferred_day_of_month: input.dueDate && input.recurrenceType === 'monthly' ? input.preferredDayOfMonth : null,
  }
}

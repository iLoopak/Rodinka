export type PlannerItemType = 'chore' | 'activity' | 'medical' | 'meal'

export type PlannerDateField = 'dueDate' | 'startDate' | 'recordDate' | 'entryDate'

export interface PlannerDatePrefill {
  field: PlannerDateField
  value: string
}

const DATE_FIELDS: Record<PlannerItemType, PlannerDateField> = {
  chore: 'dueDate',
  activity: 'startDate',
  medical: 'recordDate',
  meal: 'entryDate',
}

export function getPlannerDatePrefill(type: PlannerItemType, date?: string): PlannerDatePrefill | null {
  if (!date) return null
  return { field: DATE_FIELDS[type], value: date }
}

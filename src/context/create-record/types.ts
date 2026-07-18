export type RecordType =
  | 'household-task'
  | 'activity'
  | 'medical'
  | 'meal'
  | 'shopping-item'
  | 'meal-library'
  | 'meal-vote'

export interface CreateRecordContext {
  type?: RecordType
  date?: string
  memberId?: string
  section?: string
  source?: string
  initialTitle?: string
  mealId?: string
}

export type CreateRecordStatus = 'idle' | 'submitting' | 'error'

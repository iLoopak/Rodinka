import { supabase } from '../../supabaseClient'
import { choreInputToRow, normalizeChore, type ChoreInput } from '../../utils/choreModel'
import { todayISODate } from '../../utils/dueDate'
import type { ChoreApprovalResult } from '../../domain/chores/types'
import type { Chore } from '../../hooks/useChores'
import type { ChoreCompletion } from '../../hooks/useChoreCompletions'
import { createRealtimeSubscription, applyRealtimeDelete, applyRealtimeInsert, applyRealtimeUpdate, type RealtimeConnectionState } from '../shared/realtimeHelpers'
import { throwRepositoryError, normalizeRepositoryError } from '../shared/repositoryError'
import type { SupabaseClientLike } from '../shared/supabaseHelpers'

function completionFromRow(row: Record<string, unknown>): ChoreCompletion {
  return { ...row, reward_amount: Number(row.reward_amount) } as unknown as ChoreCompletion
}

export interface ChoresRepository {
  create(input: ChoreInput): Promise<void>
  update(id: string, input: ChoreInput): Promise<void>
  setArchived(id: string, archived: boolean): Promise<void>
  completeOccurrence(input: { choreId: string; occurrenceDate?: string }): Promise<void>
  approveCompletion(completionId: string): Promise<ChoreApprovalResult>
  rejectCompletion(completionId: string): Promise<void>
  subscribeToChanges(handlers: {
    onChoresChange: (updater: (current: Chore[]) => Chore[]) => void
    onCompletionsChange: (updater: (current: ChoreCompletion[]) => ChoreCompletion[]) => void
    onStatusChange: (status: RealtimeConnectionState) => void
  }): () => void
  toSafeError(error: unknown): Error
}

export function createChoresRepository(options: { familyId: string; userId: string; currentMemberId: string; supabaseClient?: SupabaseClientLike }): ChoresRepository {
  const client = options.supabaseClient ?? supabase
  const { familyId, userId, currentMemberId } = options
  return {
    async create(input) {
      const { error } = await client.from('chores').insert({ family_id: familyId, created_by: userId, created_by_member_id: currentMemberId, ...choreInputToRow(input) })
      if (error) throwRepositoryError(error, 'Failed to create chore')
    },
    async update(id, input) {
      const { error } = await client.from('chores').update(choreInputToRow(input)).eq('id', id).eq('family_id', familyId)
      if (error) throwRepositoryError(error, 'Failed to update chore')
    },
    async setArchived(id, archived) {
      const { error } = await client.from('chores').update({ status: archived ? 'archived' : 'active' }).eq('id', id).eq('family_id', familyId)
      if (error) throwRepositoryError(error, 'Failed to archive chore')
    },
    async completeOccurrence({ choreId, occurrenceDate }) {
      const { error } = await client.rpc('complete_household_task', { p_task_id: choreId, p_occurrence_date: occurrenceDate ?? null })
      if (error) throwRepositoryError(error, 'Failed to complete chore occurrence')
    },
    async approveCompletion(completionId) {
      const { data, error } = await client.rpc('approve_chore_completion', { completion_id: completionId, approval_date: todayISODate() })
      if (error) throwRepositoryError(error, 'Failed to approve chore completion')
      const result = data as { chore_id?: string; next_due_date?: string | null } | null
      return { choreId: result?.chore_id ?? '', nextDueDate: result?.next_due_date ?? null }
    },
    async rejectCompletion(completionId) {
      const { error } = await client.rpc('reject_chore_completion', { completion_id: completionId })
      if (error) throwRepositoryError(error, 'Failed to reject chore completion')
    },
    subscribeToChanges({ onChoresChange, onCompletionsChange, onStatusChange }) {
      return createRealtimeSubscription({
        channelName: `family:${familyId}:chores`, onStatusChange,
        tables: [
          { table: 'chores', filter: `family_id=eq.${familyId}`, onInsert: (row) => onChoresChange((current) => applyRealtimeInsert(current, normalizeChore(row as unknown as Parameters<typeof normalizeChore>[0]))), onUpdate: (row) => onChoresChange((current) => applyRealtimeUpdate(current, normalizeChore(row as unknown as Parameters<typeof normalizeChore>[0]))), onDelete: (row) => onChoresChange((current) => applyRealtimeDelete(current, row.id as string)) },
          { table: 'chore_completions', onInsert: (row) => onCompletionsChange((current) => applyRealtimeInsert(current, completionFromRow(row))), onUpdate: (row) => onCompletionsChange((current) => applyRealtimeUpdate(current, completionFromRow(row))), onDelete: (row) => onCompletionsChange((current) => applyRealtimeDelete(current, row.id as string)) },
        ],
      })
    },
    toSafeError(error) { return normalizeRepositoryError(error, 'Chores repository operation failed') },
  }
}

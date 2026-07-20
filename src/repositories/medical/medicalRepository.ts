import { supabase } from '../../supabaseClient'
import { medicalInputToRow, type MedicalRecordInput } from '../../domain/medical/types'
import type { MedicalRecord } from '../../hooks/useMedicalRecords'
import { createRealtimeSubscription, applyRealtimeDelete, applyRealtimeInsert, applyRealtimeUpdate, type RealtimeConnectionState } from '../shared/realtimeHelpers'
import { throwRepositoryError, normalizeRepositoryError } from '../shared/repositoryError'
import type { SupabaseClientLike } from '../shared/supabaseHelpers'

const MEDICAL_SELECT = 'id, family_id, patient_id, responsible_member_id, record_type, title, provider, location, record_date, start_time, end_time, status, notes, next_due_date, recurrence_interval_months, reminder_enabled, reminder_days_before, vaccine_name, vaccine_dose_number, vaccine_batch_number, vaccine_completed_date, vaccine_next_dose_date, created_at, updated_at'

export interface MedicalRepository {
  list(): Promise<MedicalRecord[]>
  create(input: MedicalRecordInput): Promise<void>
  update(id: string, input: MedicalRecordInput): Promise<void>
  subscribeToChanges(handlers: {
    onRecordsChange: (updater: (current: MedicalRecord[]) => MedicalRecord[]) => void
    onStatusChange: (status: RealtimeConnectionState) => void
  }): () => void
  toSafeError(error: unknown): Error
}

export function createMedicalRepository(options: { familyId: string; userId: string; supabaseClient?: SupabaseClientLike }): MedicalRepository {
  const client = options.supabaseClient ?? supabase
  const { familyId, userId } = options
  return {
    async list() {
      const { data, error } = await client.from('medical_records').select(MEDICAL_SELECT).eq('family_id', familyId).order('record_date')
      if (error) throwRepositoryError(error, 'Failed to load medical records')
      return data as MedicalRecord[]
    },
    async create(input) {
      const { error } = await client.from('medical_records').insert({ family_id: familyId, created_by: userId, ...medicalInputToRow(input) })
      if (error) throwRepositoryError(error, 'Failed to create medical record')
    },
    async update(id, input) {
      const { error } = await client.from('medical_records').update({ ...medicalInputToRow(input), updated_at: new Date().toISOString() }).eq('id', id).eq('family_id', familyId)
      if (error) throwRepositoryError(error, 'Failed to update medical record')
    },
    subscribeToChanges({ onRecordsChange, onStatusChange }) {
      return createRealtimeSubscription({
        channelName: `family:${familyId}:medical`,
        owner: 'MedicalProvider',
        openReason: 'provider-mount',
        onStatusChange,
        tables: [{
          table: 'medical_records',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => onRecordsChange((current) => applyRealtimeInsert(current, row as unknown as MedicalRecord)),
          onUpdate: (row) => onRecordsChange((current) => applyRealtimeUpdate(current, row as unknown as MedicalRecord)),
          onDelete: (row) => onRecordsChange((current) => applyRealtimeDelete(current, row.id as string)),
        }],
      })
    },
    toSafeError(error) { return normalizeRepositoryError(error, 'Medical repository operation failed') },
  }
}

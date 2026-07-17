import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export type MedicalRecordType =
  | 'checkup'
  | 'pediatrician'
  | 'gp'
  | 'dentist'
  | 'specialist'
  | 'vaccination'
  | 'screening'
  | 'other'

export type MedicalStatus = 'planned' | 'completed' | 'cancelled'

export interface MedicalRecord {
  id: string
  family_id: string
  patient_id: string | null
  responsible_member_id: string | null
  record_type: MedicalRecordType
  title: string
  provider: string | null
  location: string | null
  record_date: string
  start_time: string | null
  end_time: string | null
  status: MedicalStatus
  notes: string | null
  next_due_date: string | null
  recurrence_interval_months: number | null
  reminder_enabled: boolean
  reminder_days_before: number | null
  vaccine_name: string | null
  vaccine_dose_number: number | null
  vaccine_batch_number: string | null
  vaccine_completed_date: string | null
  vaccine_next_dose_date: string | null
  created_at: string
  updated_at: string
}

export function useMedicalRecords(familyId: string | undefined) {
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setMedicalRecords([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('medical_records')
      .select('id, family_id, patient_id, responsible_member_id, record_type, title, provider, location, record_date, start_time, end_time, status, notes, next_due_date, recurrence_interval_months, reminder_enabled, reminder_days_before, vaccine_name, vaccine_dose_number, vaccine_batch_number, vaccine_completed_date, vaccine_next_dose_date, created_at, updated_at')
      .eq('family_id', familyId)
      .order('record_date')

    if (error) {
      console.error('Failed to load medical records:', error.message)
      setMedicalRecords([])
      setError(t.errors.loadFailed)
    } else {
      setMedicalRecords(data)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { medicalRecords, setMedicalRecords, loading, error, refresh }
}

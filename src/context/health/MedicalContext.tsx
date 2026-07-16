import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { useMedicalRecords, type MedicalRecord } from '../../hooks/useMedicalRecords'
import { medicalInputToRow, type MedicalRecordInput } from '../../domain/medical/types'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

export type { MedicalRecordInput } from '../../domain/medical/types'

interface MedicalContextValue {
  medicalRecords: MedicalRecord[]
  medicalLoading: boolean
  medicalError: string | null
  medicalRealtimeStatus: RealtimeConnectionState
  addMedicalRecord: (input: MedicalRecordInput) => Promise<void>
  updateMedicalRecord: (id: string, input: MedicalRecordInput) => Promise<void>
  refreshMedicalRecords: () => Promise<void>
}

const MedicalContext = createContext<MedicalContextValue | null>(null)

interface ProviderProps {
  familyId: string
  userId: string
  children: ReactNode
}

export function MedicalProvider({ familyId, userId, children }: ProviderProps) {
  const {
    medicalRecords,
    setMedicalRecords,
    loading: medicalLoading,
    error: medicalError,
    refresh: refreshMedicalRecords,
  } = useMedicalRecords(familyId)
  const [medicalRealtimeStatus, setMedicalRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:medical`,
      onStatusChange: setMedicalRealtimeStatus,
      tables: [{
        table: 'medical_records',
        filter: `family_id=eq.${familyId}`,
        onInsert: (row) => setMedicalRecords((current) => applyRealtimeInsert(current, row as unknown as MedicalRecord)),
        onUpdate: (row) => setMedicalRecords((current) => applyRealtimeUpdate(current, row as unknown as MedicalRecord)),
        onDelete: (row) => setMedicalRecords((current) => applyRealtimeDelete(current, row.id as string)),
      }],
    })
    return unsubscribe
  }, [familyId, setMedicalRecords])

  const addMedicalRecord = useCallback(
    async (input: MedicalRecordInput) => {
      const { error } = await supabase
        .from('medical_records')
        .insert({ family_id: familyId, created_by: userId, ...medicalInputToRow(input) })
      if (error) throw friendly(error)
      await refreshMedicalRecords()
    },
    [familyId, userId, refreshMedicalRecords]
  )

  const updateMedicalRecord = useCallback(
    async (id: string, input: MedicalRecordInput) => {
      const { error } = await supabase
        .from('medical_records')
        .update({ ...medicalInputToRow(input), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw friendly(error)
      await refreshMedicalRecords()
    },
    [refreshMedicalRecords]
  )

  const value: MedicalContextValue = {
    medicalRecords,
    medicalLoading,
    medicalError,
    medicalRealtimeStatus,
    addMedicalRecord,
    updateMedicalRecord,
    refreshMedicalRecords,
  }

  return <MedicalContext.Provider value={value}>{children}</MedicalContext.Provider>
}

export function useMedicalData() {
  const ctx = useContext(MedicalContext)
  if (!ctx) throw new Error('useMedicalData must be used within a MedicalProvider')
  return ctx
}

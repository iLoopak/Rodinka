import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMedicalRecords, type MedicalRecord } from '../../hooks/useMedicalRecords'
import type { MedicalRecordInput } from '../../domain/medical/types'
import { createMedicalRepository } from '../../repositories/medical/medicalRepository'
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
  const medicalRepository = useMemo(() => createMedicalRepository({ familyId, userId }), [familyId, userId])

  useEffect(() => {
    if (!familyId) return
    return medicalRepository.subscribeToChanges({
      onStatusChange: setMedicalRealtimeStatus,
      onRecordsChange: setMedicalRecords,
    })
  }, [familyId, medicalRepository, setMedicalRecords])

  const addMedicalRecord = useCallback(
    async (input: MedicalRecordInput) => {
      try {
        await medicalRepository.create(input)
        await refreshMedicalRecords()
      } catch (error) {
        throw medicalRepository.toSafeError(error)
      }
    },
    [medicalRepository, refreshMedicalRecords]
  )

  const updateMedicalRecord = useCallback(
    async (id: string, input: MedicalRecordInput) => {
      try {
        await medicalRepository.update(id, input)
        await refreshMedicalRecords()
      } catch (error) {
        throw medicalRepository.toSafeError(error)
      }
    },
    [medicalRepository, refreshMedicalRecords]
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

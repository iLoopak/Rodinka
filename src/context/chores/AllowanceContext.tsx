import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { useAllowanceLedger, type LedgerEntry } from '../../hooks/useAllowanceLedger'
import { useAllowancePlans, type AllowanceCycle, type AllowancePlan, type AllowancePlanInput } from '../../hooks/useAllowancePlans'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import type { RealtimeConnectionState } from '../../realtime/connectionState'

export type { AllowancePlanInput } from '../../hooks/useAllowancePlans'

interface AllowanceContextValue {
  allowancePlans: AllowancePlan[]
  allowanceCycles: AllowanceCycle[]
  balances: Map<string, number>
  allowanceLoading: boolean
  allowanceError: string | null
  allowanceRealtimeStatus: RealtimeConnectionState
  payout: (memberId: string, amount: number, reason: string) => Promise<void>
  saveAllowancePlan: (input: AllowancePlanInput, planId?: string) => Promise<void>
  creditAllowance: (planId: string, payoutDate: string) => Promise<void>
  skipAllowance: (planId: string, payoutDate: string) => Promise<void>
  refreshLedger: () => Promise<void>
  refreshAllowancePlans: () => Promise<void>
}

const AllowanceContext = createContext<AllowanceContextValue | null>(null)

interface ProviderProps {
  familyId: string
  children: ReactNode
}

export function AllowanceProvider({ familyId, children }: ProviderProps) {
  const {
    entries,
    setEntries,
    loading: ledgerLoading,
    error: ledgerError,
    refresh: refreshLedger,
  } = useAllowanceLedger(familyId)
  const {
    plans: allowancePlans,
    cycles: allowanceCycles,
    loading: allowancePlansLoading,
    error: allowancePlansError,
    refresh: refreshAllowancePlans,
  } = useAllowancePlans(familyId)
  const [allowanceRealtimeStatus, setAllowanceRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  // Only the ledger is realtime-subscribed (per the supported-modules list —
  // "allowance ledger", not plans/cycles); those stay on manual refresh.
  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:allowance`,
      onStatusChange: setAllowanceRealtimeStatus,
      tables: [{
        table: 'allowance_ledger',
        filter: `family_id=eq.${familyId}`,
        onInsert: (row) => setEntries((current) => applyRealtimeInsert(current, row as unknown as LedgerEntry)),
        onUpdate: (row) => setEntries((current) => applyRealtimeUpdate(current, row as unknown as LedgerEntry)),
        onDelete: (row) => setEntries((current) => applyRealtimeDelete(current, row.id as string)),
      }],
    })
    return unsubscribe
  }, [familyId, setEntries])

  const balances = useMemo(() => {
    const totals = new Map<string, number>()
    for (const entry of entries) {
      if (!entry.member_id) continue
      totals.set(entry.member_id, (totals.get(entry.member_id) ?? 0) + Number(entry.amount))
    }
    return totals
  }, [entries])

  const payout = useCallback(
    async (memberId: string, amount: number, reason: string) => {
      const { error } = await supabase.rpc('record_payout', {
        target_member_id: memberId,
        payout_amount: amount,
        payout_reason: reason || null,
      })
      if (error) throw friendly(error)
      await refreshLedger()
    },
    [refreshLedger]
  )

  const saveAllowancePlan = useCallback(async (input: AllowancePlanInput, planId?: string) => {
    const planData = {
      family_id: familyId,
      member_id: input.memberId,
      amount: input.amount,
      payout_day: input.payoutDay,
      starts_on: input.startsOn,
      status: input.status,
      condition_mode: input.conditionMode,
    }
    const { error } = await supabase.rpc('save_allowance_plan', {
      target_plan_id: planId ?? null,
      plan_data: planData,
      requirements_data: input.requirements.map((requirement) => ({
        chore_id: requirement.choreId,
        requirement_type: requirement.requirementType,
        required_count: requirement.requiredCount,
      })),
    })
    if (error) throw friendly(error)
    await refreshAllowancePlans()
  }, [familyId, refreshAllowancePlans])

  const creditAllowance = useCallback(async (planId: string, payoutDate: string) => {
    const { error } = await supabase.rpc('credit_monthly_allowance', { plan_id: planId, payout_date: payoutDate })
    if (error) throw friendly(error)
    await Promise.all([refreshAllowancePlans(), refreshLedger()])
  }, [refreshAllowancePlans, refreshLedger])

  const skipAllowance = useCallback(async (planId: string, payoutDate: string) => {
    const { error } = await supabase.rpc('skip_monthly_allowance', { plan_id: planId, payout_date: payoutDate })
    if (error) throw friendly(error)
    await refreshAllowancePlans()
  }, [refreshAllowancePlans])

  const value: AllowanceContextValue = {
    allowancePlans,
    allowanceCycles,
    balances,
    allowanceLoading: ledgerLoading || allowancePlansLoading,
    allowanceError: ledgerError || allowancePlansError,
    allowanceRealtimeStatus,
    payout,
    saveAllowancePlan,
    creditAllowance,
    skipAllowance,
    refreshLedger,
    refreshAllowancePlans,
  }

  return <AllowanceContext.Provider value={value}>{children}</AllowanceContext.Provider>
}

export function useAllowanceData() {
  const ctx = useContext(AllowanceContext)
  if (!ctx) throw new Error('useAllowanceData must be used within an AllowanceProvider')
  return ctx
}

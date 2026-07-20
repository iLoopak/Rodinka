import { useCallback, useEffect, useMemo, useState } from 'react'
import { SupabaseAllowanceRepository } from '../features/allowance/data/supabaseAllowanceRepository'
import { t } from '../strings'
import type { AllowanceConditionMode, AllowanceFrequency, AllowancePlanStatus, AllowanceRequirementType } from '../utils/allowanceCycles'

export interface AllowanceRequirement {
  id: string
  plan_id: string
  chore_id: string
  requirement_type: AllowanceRequirementType
  required_count: number
  created_at: string
}

export interface AllowancePlan {
  id: string
  family_id: string
  member_id: string
  amount: number
  frequency: AllowanceFrequency
  /** Set for monthly plans only; weekly plans anchor on payout_weekday. */
  payout_day: number | null
  /** ISO weekday (1 = Monday … 7 = Sunday). Set for weekly plans only. */
  payout_weekday: number | null
  note: string | null
  starts_on: string
  status: AllowancePlanStatus
  condition_mode: AllowanceConditionMode
  created_at: string
  updated_at: string
  requirements: AllowanceRequirement[]
}

export interface AllowanceCycle {
  id: string
  plan_id: string
  payout_date: string
  period_start: string
  period_end: string
  status: 'credited' | 'skipped'
  credited_amount: number | null
  ledger_entry_id: string | null
  evaluated_at: string
}

export interface AllowancePlanInput {
  memberId: string
  amount: number
  frequency: AllowanceFrequency
  payoutDay: number | null
  payoutWeekday: number | null
  note: string | null
  startsOn: string
  status: AllowancePlanStatus
  conditionMode: AllowanceConditionMode
  requirements: Array<{
    choreId: string
    requirementType: AllowanceRequirementType
    requiredCount: number
  }>
}

export function useAllowancePlans(familyId: string | undefined) {
  const repository = useMemo(() => new SupabaseAllowanceRepository(), [])
  const [plans, setPlans] = useState<AllowancePlan[]>([])
  const [cycles, setCycles] = useState<AllowanceCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setPlans([]); setCycles([]); setLoading(false); return
    }
    setLoading(true)
    try {
      const state = await repository.loadPlans({ familyId })
      setPlans(state.plans)
      setCycles(state.cycles)
      setError(null)
    } catch (loadError) {
      console.error('Failed to load allowance plans:', loadError instanceof Error ? loadError.message : 'unknown error')
      setPlans([]); setCycles([]); setError(t.errors.loadFailed)
    }
    setLoading(false)
  }, [familyId, repository])

  useEffect(() => { void refresh() }, [refresh])
  return { plans, cycles, loading, error, refresh }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import type { AllowanceConditionMode, AllowancePlanStatus, AllowanceRequirementType } from '../utils/allowanceCycles'

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
  payout_day: number
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
  payoutDay: number
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
  const [plans, setPlans] = useState<AllowancePlan[]>([])
  const [cycles, setCycles] = useState<AllowanceCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setPlans([]); setCycles([]); setLoading(false); return
    }
    setLoading(true)
    const [plansResult, cyclesResult] = await Promise.all([
      supabase.from('allowance_plans')
        .select('id, family_id, member_id, amount, payout_day, starts_on, status, condition_mode, created_at, updated_at, allowance_plan_requirements(id, plan_id, chore_id, requirement_type, required_count, created_at)')
        .eq('family_id', familyId).order('created_at'),
      supabase.from('allowance_cycles')
        .select('id, plan_id, payout_date, period_start, period_end, status, credited_amount, ledger_entry_id, evaluated_at, allowance_plans!inner(family_id)')
        .eq('allowance_plans.family_id', familyId).order('payout_date', { ascending: false }),
    ])
    if (plansResult.error || cyclesResult.error) {
      console.error('Failed to load allowance plans:', plansResult.error?.message ?? cyclesResult.error?.message)
      setPlans([]); setCycles([]); setError(t.errors.loadFailed)
    } else {
      setPlans((plansResult.data ?? []).map((row) => ({
        ...row,
        requirements: row.allowance_plan_requirements ?? [],
      })) as AllowancePlan[])
      setCycles((cyclesResult.data ?? []) as AllowanceCycle[])
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => { void refresh() }, [refresh])
  return { plans, cycles, loading, error, refresh }
}

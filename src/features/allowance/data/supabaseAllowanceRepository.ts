import { supabase } from '../../../supabaseClient'
import { classifyAppError, isRetryableErrorCode, type AppErrorCode } from '../../../errors/errorCodes'
import type { AllowancePlanInput } from '../../../hooks/useAllowancePlans'
import {
  ALLOWANCE_CYCLE_COLUMNS,
  ALLOWANCE_LEDGER_COLUMNS,
  ALLOWANCE_PLAN_COLUMNS,
  mapAllowanceCycle,
  mapLedgerEntry,
  mapAllowancePlan,
} from '../domain/allowanceMappers'
import type { AllowanceRepository, AllowanceScope } from './allowanceRepository'

export type AllowanceOperation =
  | 'allowance.loadPlans'
  | 'allowance.listLedger'
  | 'allowance.savePlan'
  | 'allowance.deletePlan'
  | 'allowance.recordPayout'
  | 'allowance.creditCycle'
  | 'allowance.skipCycle'

export class AllowanceError extends Error {
  readonly code: AppErrorCode
  readonly operation: AllowanceOperation
  readonly retryable: boolean

  constructor(operation: AllowanceOperation, code: AppErrorCode, cause?: unknown) {
    super(`allowance:${operation}:${code}`)
    this.name = 'AllowanceError'
    this.operation = operation
    this.code = code
    this.retryable = isRetryableErrorCode(code)
    this.cause = cause
  }
}

function message(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
}

function refine(operation: AllowanceOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  const text = message(error)
  // Settling a cycle twice is the failure mode that matters here: the second
  // attempt must read as "already done", never as something to retry, or a
  // family gets paid twice.
  if ((operation === 'allowance.creditCycle' || operation === 'allowance.skipCycle')
    && /already (credited|settled|skipped)|duplicate|not open/i.test(text)) return 'conflict'
  if (operation === 'allowance.savePlan' && /amount|invalid|check constraint|positive/i.test(text)) return 'conflict'
  return code
}

function toAllowanceError(operation: AllowanceOperation, error: unknown): AllowanceError {
  if (error instanceof AllowanceError) return error
  const browserOnline = typeof navigator === 'undefined' ? undefined : navigator.onLine !== false
  return new AllowanceError(operation, refine(operation, classifyAppError(error, { browserOnline }), error), error)
}

type Row = Record<string, unknown>

async function run<T>(operation: AllowanceOperation, work: () => PromiseLike<{ data: unknown; error: unknown }>, map: (data: unknown) => T): Promise<T> {
  let result: { data: unknown; error: unknown }
  try {
    result = await work()
  } catch (error) {
    throw toAllowanceError(operation, error)
  }
  if (result.error) throw toAllowanceError(operation, result.error)
  return map(result.data)
}

const rows = (data: unknown): Row[] => Array.isArray(data) ? (data as Row[]) : []

export class SupabaseAllowanceRepository implements AllowanceRepository {
  async loadPlans(scope: AllowanceScope) {
    const [plans, cycles] = await Promise.all([
      run('allowance.loadPlans',
        () => supabase.from('allowance_plans').select(ALLOWANCE_PLAN_COLUMNS).eq('family_id', scope.familyId).order('created_at'),
        (data) => rows(data).map(mapAllowancePlan)),
      run('allowance.loadPlans',
        () => supabase.from('allowance_cycles').select(ALLOWANCE_CYCLE_COLUMNS)
          .eq('allowance_plans.family_id', scope.familyId).order('payout_date', { ascending: false }),
        (data) => rows(data).map(mapAllowanceCycle)),
    ])
    return { plans, cycles }
  }

  async listLedger(scope: AllowanceScope) {
    return run('allowance.listLedger',
      () => supabase.from('allowance_ledger').select(ALLOWANCE_LEDGER_COLUMNS)
        .eq('family_id', scope.familyId).order('created_at', { ascending: false }),
      (data) => rows(data).map(mapLedgerEntry))
  }

  async savePlan(scope: AllowanceScope, input: AllowancePlanInput, planId?: string) {
    await run('allowance.savePlan',
      () => supabase.rpc('save_allowance_plan', {
        target_plan_id: planId ?? null,
        plan_data: {
          family_id: scope.familyId,
          member_id: input.memberId,
          amount: input.amount,
          frequency: input.frequency,
          payout_day: input.payoutDay,
          payout_weekday: input.payoutWeekday,
          note: input.note,
          starts_on: input.startsOn,
          status: input.status,
          condition_mode: input.conditionMode,
        },
        requirements_data: input.requirements.map((requirement) => ({
          chore_id: requirement.choreId,
          requirement_type: requirement.requirementType,
          required_count: requirement.requiredCount,
        })),
      }),
      () => undefined)
  }

  async deletePlan(planId: string) {
    await run('allowance.deletePlan',
      () => supabase.rpc('delete_allowance_plan', { target_plan_id: planId }),
      () => undefined)
  }

  async recordPayout(memberId: string, amount: number, reason: string) {
    await run('allowance.recordPayout',
      () => supabase.rpc('record_payout', {
        target_member_id: memberId, payout_amount: amount, payout_reason: reason || null,
      }),
      () => undefined)
  }

  async creditCycle(planId: string, payoutDate: string) {
    await run('allowance.creditCycle',
      () => supabase.rpc('credit_monthly_allowance', { plan_id: planId, payout_date: payoutDate }),
      () => undefined)
  }

  async skipCycle(planId: string, payoutDate: string) {
    await run('allowance.skipCycle',
      () => supabase.rpc('skip_monthly_allowance', { plan_id: planId, payout_date: payoutDate }),
      () => undefined)
  }
}

import type { AllowanceCycle, AllowancePlan, AllowancePlanInput } from '../../../hooks/useAllowancePlans'
import type { LedgerEntry } from '../../../hooks/useAllowanceLedger'

export interface AllowanceScope {
  familyId: string
}

export interface AllowancePlanState {
  plans: AllowancePlan[]
  cycles: AllowanceCycle[]
}

/**
 * The ledger is append-only: there is no update or delete here, and there is
 * no generic insert either. Every entry arrives through an operation with a
 * meaning — a payout, a settled cycle — so the reason for money moving is
 * always recorded alongside it.
 *
 * Settlement operations are RPCs because each one writes a ledger entry and a
 * cycle row together. Doing that as two client writes would leave a family's
 * balance wrong whenever the second one failed.
 */
export interface AllowanceRepository {
  loadPlans(scope: AllowanceScope): Promise<AllowancePlanState>
  listLedger(scope: AllowanceScope): Promise<LedgerEntry[]>
  savePlan(scope: AllowanceScope, input: AllowancePlanInput, planId?: string): Promise<void>
  /**
   * Removes a plan that never settled a cycle; one with ledger history is
   * archived server-side instead. Either way it stops appearing, so the caller
   * does not have to tell the two apart.
   */
  deletePlan(planId: string): Promise<void>
  recordPayout(memberId: string, amount: number, reason: string): Promise<void>
  /** Settles a cycle: writes the ledger entry and marks the cycle credited. */
  creditCycle(planId: string, payoutDate: string): Promise<void>
  skipCycle(planId: string, payoutDate: string): Promise<void>
}

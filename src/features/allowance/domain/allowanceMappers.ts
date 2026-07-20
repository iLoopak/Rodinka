import type { AllowanceCycle, AllowancePlan } from '../../../hooks/useAllowancePlans'
import type { LedgerEntry } from '../../../hooks/useAllowanceLedger'

export const ALLOWANCE_PLAN_COLUMNS =
  'id, family_id, member_id, amount, frequency, payout_day, payout_weekday, note, starts_on, status, condition_mode, created_at, updated_at, allowance_plan_requirements(id, plan_id, chore_id, requirement_type, required_count, created_at)'

export const ALLOWANCE_CYCLE_COLUMNS =
  'id, plan_id, payout_date, period_start, period_end, status, credited_amount, ledger_entry_id, evaluated_at, allowance_plans!inner(family_id)'

export const ALLOWANCE_LEDGER_COLUMNS =
  'id, member_id, amount, reason, created_at, entry_type, source_chore_completion_id, source_allowance_cycle_id'

type Row = Record<string, unknown>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const nullableText = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null

/**
 * Money arrives from Postgres `numeric` as a string. Every amount in this
 * domain goes through here, because a forgotten conversion turns a balance
 * into string concatenation rather than an error anyone would notice.
 */
export function money(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function mapAllowancePlan(row: Row): AllowancePlan {
  return {
    ...(row as unknown as AllowancePlan),
    id: text(row.id),
    family_id: text(row.family_id),
    member_id: text(row.member_id),
    amount: money(row.amount),
    payout_day: nullableNumber(row.payout_day),
    payout_weekday: nullableNumber(row.payout_weekday),
    note: nullableText(row.note),
    requirements: Array.isArray(row.allowance_plan_requirements)
      ? (row.allowance_plan_requirements as AllowancePlan['requirements'])
      : [],
  }
}

export function mapAllowanceCycle(row: Row): AllowanceCycle {
  return {
    ...(row as unknown as AllowanceCycle),
    id: text(row.id),
    plan_id: text(row.plan_id),
    // A cycle that has not settled yet has no credited amount at all, which is
    // different from having settled for zero.
    credited_amount: row.credited_amount === null || row.credited_amount === undefined ? null : money(row.credited_amount),
    ledger_entry_id: nullableText(row.ledger_entry_id),
  }
}

export function mapLedgerEntry(row: Row): LedgerEntry {
  return {
    ...(row as unknown as LedgerEntry),
    id: text(row.id),
    // A ledger entry can outlive the member it belonged to, so member_id is
    // genuinely nullable rather than merely absent.
    member_id: nullableText(row.member_id),
    amount: money(row.amount),
    reason: nullableText(row.reason),
    source_chore_completion_id: nullableText(row.source_chore_completion_id),
    source_allowance_cycle_id: nullableText(row.source_allowance_cycle_id),
  }
}

/** Balance per member. Ledger entries are append-only, so this is a fold. */
export function balancesFromLedger(entries: LedgerEntry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    // Entries left behind by a removed member still exist but belong to nobody,
    // so they contribute to no balance.
    if (!entry.member_id) continue
    totals.set(entry.member_id, (totals.get(entry.member_id) ?? 0) + entry.amount)
  }
  return totals
}

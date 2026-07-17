import { t } from '../strings'
import type { AllowanceFrequency } from './allowanceCycles'

interface SummarizablePlan {
  amount: number
  frequency: AllowanceFrequency
  payout_day: number | null
  payout_weekday: number | null
}

/**
 * The payout anchor as a phrase: "každou neděli" / "každý 1. den v měsíci".
 * Czech needs the weekday already inflected, so the weekday phrases are whole
 * strings in the catalogue rather than a name slotted into a template.
 */
export function allowanceAnchorLabel(plan: Pick<SummarizablePlan, 'frequency' | 'payout_day' | 'payout_weekday'>): string {
  if (plan.frequency === 'weekly') {
    const weekday = plan.payout_weekday
    if (weekday === null || weekday < 1 || weekday > 7) return ''
    return t.allowance.everyWeekday[weekday - 1]
  }
  return plan.payout_day === null ? '' : t.allowance.everyMonthOnDay(plan.payout_day)
}

export function allowanceFrequencyLabel(frequency: AllowanceFrequency): string {
  return frequency === 'weekly' ? t.allowance.frequencyWeekly : t.allowance.frequencyMonthly
}

/** "200 Kč měsíčně · každý 1. den v měsíci" */
export function allowancePlanSummary(plan: SummarizablePlan): string {
  const head = `${t.chores.formatAmount(plan.amount)} ${allowanceFrequencyLabel(plan.frequency)}`
  const anchor = allowanceAnchorLabel(plan)
  return anchor ? `${head} · ${anchor}` : head
}

import { t } from '../../strings'
import type { AllowancePlan } from '../../hooks/useAllowancePlans'
import { allowancePlanSummary } from '../../utils/allowanceSummary'

/**
 * The child's current allowance in one line: "200 Kč měsíčně · každý 1. den
 * v měsíci", or the not-set state. Paused is carried by text, not colour.
 */
export function AllowancePlanSummaryLine({ plan }: { plan: AllowancePlan | null }) {
  if (!plan) return <span className="allowance-summary-line is-unset">{t.allowance.notSet}</span>
  return (
    <span className="allowance-summary-line">
      <span>{allowancePlanSummary(plan)}</span>
      {plan.status === 'paused' && <span className="allowance-paused-badge">{t.allowance.statusPaused}</span>}
    </span>
  )
}

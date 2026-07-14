import { useState } from 'react'
import { t } from '../strings'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { MemberAvatar } from './ui/MemberAvatar'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { AllowanceCycle, AllowancePlan, AllowancePlanInput } from '../hooks/useAllowancePlans'
import { allowanceCycleForPayout, evaluateAllowanceRequirements, nextPayoutDate, unsettledDuePayoutDates } from '../utils/allowanceCycles'
import { addDays, formatFullDate, todayISODate } from '../utils/dueDate'
import { Modal } from './ui/Modal'
import { AllowancePlanForm } from './AllowancePlanForm'

interface Props {
  kids: FamilyMember[]
  balances: Map<string, number>
  onPayout: (memberId: string, amount: number, reason: string) => Promise<void>
  chores: Chore[]
  completions: ChoreCompletion[]
  plans: AllowancePlan[]
  cycles: AllowanceCycle[]
  canManage: boolean
  onSavePlan: (input: AllowancePlanInput, planId?: string) => Promise<void>
  onCredit: (planId: string, payoutDate: string) => Promise<void>
  onSkip: (planId: string, payoutDate: string) => Promise<void>
}

export function AllowanceBalances({ kids, balances, onPayout, chores, completions, plans, cycles, canManage, onSavePlan, onCredit, onSkip }: Props) {
  const [payoutFor, setPayoutFor] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingFor, setEditingFor] = useState<string | null>(null)

  function openPayout(memberId: string) {
    setPayoutFor(memberId)
    setAmount('')
    setReason('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent, memberId: string) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onPayout(memberId, Number(amount) || 0, reason)
      setPayoutFor(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (kids.length === 0) {
    return <p className="empty-state">{t.chores.noMembers}</p>
  }

  return (
    <ul className="section-list">
      {kids.map((kid) => {
        const plan = plans.find((item) => item.member_id === kid.id && item.status !== 'archived')
        let payoutDate: string | null = null
        let evaluation: ReturnType<typeof evaluateAllowanceRequirements> | null = null
        if (plan?.status === 'active') {
          const today = todayISODate()
          const dueDates = unsettledDuePayoutDates(plan, cycles.filter((cycle) => cycle.plan_id === plan.id).map((cycle) => cycle.payout_date), today)
          payoutDate = dueDates[0] ?? nextPayoutDate(addDays(today, 1), plan.payout_day)
          const cycle = allowanceCycleForPayout(plan, payoutDate)
          evaluation = evaluateAllowanceRequirements(plan.member_id, plan.condition_mode, plan.requirements, completions, cycle)
        }
        const due = !!payoutDate && payoutDate <= todayISODate()
        return <li key={kid.id} className="allowance-card">
          <MemberAvatar member={kid} />
          <span className="row-title">{kid.display_name}</span>
          <span className="row-spacer" />
          <span className="row-amount">{t.chores.formatAmount(balances.get(kid.id) ?? 0)}</span>
          {canManage && <button className="btn-secondary" onClick={() => setEditingFor(kid.id)}>{plan ? t.allowance.manage : t.allowance.setUp}</button>}
          <button className="btn-secondary" disabled={!canManage} onClick={() => openPayout(kid.id)}>
            {t.chores.payoutButton}
          </button>
          {plan && <div className="allowance-plan-summary">
            <strong>{t.allowance.monthly}: {t.chores.formatAmount(plan.amount)}</strong>
            <span>{t.allowance.payoutDay}: {plan.payout_day}. · {plan.condition_mode === 'none' ? t.allowance.unconditional : t.allowance.byChores}</span>
            {payoutDate && <span>{t.allowance.nextPayout}: {formatFullDate(payoutDate)}</span>}
            {evaluation && plan.condition_mode === 'chores' && <ul className="compact-list">{evaluation.progress.map((progress) => <li key={progress.choreId}>
              {chores.find((chore) => chore.id === progress.choreId)?.title ?? '?'}: {progress.approvedCount}/{progress.requiredCount}
              {progress.pendingCount > 0 ? ` · ${t.allowance.waitingApproval}` : ''}
            </li>)}</ul>}
            {due && <span>{evaluation?.eligible ? t.allowance.conditionsMet : t.allowance.conditionsMissing}</span>}
            {due && canManage && <div className="form-inline-actions">
              <button disabled={!evaluation?.eligible || loading} onClick={async () => { setLoading(true); try { await onCredit(plan.id, payoutDate!) } finally { setLoading(false) } }}>{t.allowance.credit}</button>
              <button className="btn-secondary" disabled={loading} onClick={async () => { setLoading(true); try { await onSkip(plan.id, payoutDate!) } finally { setLoading(false) } }}>{t.allowance.skip}</button>
            </div>}
          </div>}
          {payoutFor === kid.id && (
            <form onSubmit={(e) => handleSubmit(e, kid.id)}>
              <h4>{t.chores.payoutTitle}</h4>
              <label>
                {t.chores.payoutAmountLabel}
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                {t.chores.payoutReasonLabel}
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? t.chores.payingOut : t.chores.payoutSubmit}
              </button>
              <button type="button" className="link" onClick={() => setPayoutFor(null)}>
                {t.chores.cancel}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          )}
          {editingFor === kid.id && <Modal title={t.allowance.setUp} onClose={() => setEditingFor(null)}>
            <AllowancePlanForm child={kid} chores={chores} initial={plan} onSubmit={async (input) => { await onSavePlan(input, plan?.id); setEditingFor(null) }} />
          </Modal>}
        </li>
      })}
    </ul>
  )
}

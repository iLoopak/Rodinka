import { useState } from 'react'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { Chore } from '../hooks/useChores'
import type { AllowancePlan, AllowancePlanInput } from '../hooks/useAllowancePlans'
import type { AllowanceRequirementType } from '../utils/allowanceCycles'
import { todayISODate } from '../utils/dueDate'
import { t } from '../strings'

interface Props {
  child: FamilyMember
  chores: Chore[]
  initial?: AllowancePlan
  onSubmit: (input: AllowancePlanInput) => Promise<void>
}

export function AllowancePlanForm({ child, chores, initial, onSubmit }: Props) {
  const [amount, setAmount] = useState(String(initial?.amount ?? ''))
  const [payoutDay, setPayoutDay] = useState(String(initial?.payout_day ?? 15))
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? todayISODate())
  const [conditionMode, setConditionMode] = useState(initial?.condition_mode ?? 'none')
  const [status, setStatus] = useState(initial?.status ?? 'active')
  const [requirements, setRequirements] = useState(() => new Map(
    (initial?.requirements ?? []).map((requirement) => [requirement.chore_id, {
      requirementType: requirement.requirement_type,
      requiredCount: requirement.required_count,
    }])
  ))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const availableChores = chores.filter((chore) => chore.assigned_to === child.id && chore.recurring)

  function toggleChore(choreId: string) {
    setRequirements((previous) => {
      const next = new Map(previous)
      if (next.has(choreId)) next.delete(choreId)
      else next.set(choreId, { requirementType: 'per_cycle' as AllowanceRequirementType, requiredCount: 1 })
      return next
    })
  }

  function updateRequirement(choreId: string, patch: Partial<{ requirementType: AllowanceRequirementType; requiredCount: number }>) {
    setRequirements((previous) => {
      const next = new Map(previous)
      const current = next.get(choreId)
      if (current) next.set(choreId, { ...current, ...patch })
      return next
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null)
    if (conditionMode === 'chores' && requirements.size === 0) {
      setError(t.allowance.requirementRequired); return
    }
    setLoading(true)
    try {
      await onSubmit({
        memberId: child.id,
        amount: Number(amount),
        payoutDay: Number(payoutDay),
        startsOn,
        status,
        conditionMode,
        requirements: [...requirements].map(([choreId, requirement]) => ({ choreId, ...requirement })),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally { setLoading(false) }
  }

  return <form className="sectioned-form" onSubmit={submit}>
    <label>{t.allowance.amount}<input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
    <label>{t.allowance.payoutDay}<input required type="number" min="1" max="31" value={payoutDay} onChange={(e) => setPayoutDay(e.target.value)} /></label>
    <label>{t.allowance.startsOn}<input required type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></label>
    <label>{t.allowance.conditions}
      <select value={conditionMode} onChange={(e) => setConditionMode(e.target.value as 'none' | 'chores')}>
        <option value="none">{t.allowance.unconditional}</option>
        <option value="chores">{t.allowance.byChores}</option>
      </select>
    </label>
    {conditionMode === 'chores' && <div className="requirement-editor">
      {availableChores.length === 0 && <p className="row-meta">{t.allowance.noEligibleChores}</p>}
      {availableChores.map((chore) => {
        const requirement = requirements.get(chore.id)
        return <div key={chore.id} className="requirement-row">
          <label className="checkbox-label"><input type="checkbox" checked={!!requirement} onChange={() => toggleChore(chore.id)} />{chore.title}</label>
          {requirement && <div className="form-inline-actions">
            <select value={requirement.requirementType} onChange={(e) => updateRequirement(chore.id, { requirementType: e.target.value as AllowanceRequirementType })}>
              <option value="per_cycle">{t.allowance.perCycle}</option>
              <option value="weekly">{t.allowance.weekly}</option>
            </select>
            <input aria-label={t.allowance.requiredCount} type="number" min="1" value={requirement.requiredCount} onChange={(e) => updateRequirement(chore.id, { requiredCount: Number(e.target.value) })} />
          </div>}
        </div>
      })}
    </div>}
    {initial && <label>{t.allowance.planStatus}<select value={status} onChange={(e) => setStatus(e.target.value as AllowancePlan['status'])}>
      <option value="active">{t.allowance.active}</option><option value="paused">{t.allowance.paused}</option><option value="archived">{t.allowance.archived}</option>
    </select></label>}
    <button type="submit" disabled={loading}>{loading ? t.allowance.saving : t.allowance.save}</button>
    {error && <p className="error">{error}</p>}
  </form>
}

import { useState } from 'react'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { Chore } from '../hooks/useChores'
import type { AllowancePlan, AllowancePlanInput } from '../hooks/useAllowancePlans'
import type { AllowanceFrequency, AllowanceRequirementType } from '../utils/allowanceCycles'
import { todayISODate } from '../utils/dueDate'
import { t } from '../strings'
import { ConfirmDestructiveActionDialog } from './ui/DestructiveActions'

interface Props {
  child: FamilyMember
  chores: Chore[]
  initial?: AllowancePlan
  onSubmit: (input: AllowancePlanInput) => Promise<void>
  onDelete?: () => Promise<void>
}

export function AllowancePlanForm({ child, chores, initial, onSubmit, onDelete }: Props) {
  const [amount, setAmount] = useState(String(initial?.amount ?? ''))
  const [frequency, setFrequency] = useState<AllowanceFrequency>(initial?.frequency ?? 'monthly')
  const [payoutDay, setPayoutDay] = useState(String(initial?.payout_day ?? 15))
  const [payoutWeekday, setPayoutWeekday] = useState(String(initial?.payout_weekday ?? 1))
  const [note, setNote] = useState(initial?.note ?? '')
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
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const availableChores = chores.filter((chore) => chore.assigned_to === child.id && chore.recurring && chore.status === 'active')

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

  // The unused anchor is sent as null so the saved row can never carry both a
  // payout day and a payout weekday.
  function buildInput(nextStatus = status): AllowancePlanInput {
    return {
      memberId: child.id,
      amount: Number(amount),
      frequency,
      payoutDay: frequency === 'monthly' ? Number(payoutDay) : null,
      payoutWeekday: frequency === 'weekly' ? Number(payoutWeekday) : null,
      note: note.trim() || null,
      startsOn,
      status: nextStatus,
      conditionMode,
      requirements: [...requirements].map(([choreId, requirement]) => ({ choreId, ...requirement })),
    }
  }

  async function save(input: AllowancePlanInput) {
    setError(null)
    if (conditionMode === 'chores' && requirements.size === 0) {
      setError(t.allowance.requirementRequired); return
    }
    setLoading(true)
    try {
      await onSubmit(input)
    } catch (caught) {
      console.error('Failed to save allowance plan:', caught)
      setError(t.errors.generic)
    } finally { setLoading(false) }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    await save(buildInput())
  }

  // Pause and resume are the same save with a different status, so a paused
  // plan keeps its amount, schedule, and conditions untouched.
  async function togglePaused() {
    const nextStatus = status === 'paused' ? 'active' : 'paused'
    setStatus(nextStatus)
    await save(buildInput(nextStatus))
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
      setConfirmingDelete(false)
    } catch (caught) {
      console.error('Failed to delete allowance plan:', caught)
      setDeleteError(t.allowance.deleteFailed)
    } finally { setDeleting(false) }
  }

  const busy = loading || deleting

  return <>
    <form className="sectioned-form" onSubmit={submit}>
      {initial?.status === 'paused' && <p className="allowance-paused-banner" role="status">{t.allowance.statusPaused}</p>}

      <label>{t.allowance.amount}<input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>

      <label>{t.allowance.frequency}
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as AllowanceFrequency)}>
          <option value="monthly">{t.allowance.frequencyMonthlyOption}</option>
          <option value="weekly">{t.allowance.frequencyWeeklyOption}</option>
        </select>
      </label>

      {frequency === 'monthly'
        ? <label>{t.allowance.payoutDay}<input required type="number" min="1" max="31" value={payoutDay} onChange={(e) => setPayoutDay(e.target.value)} /></label>
        : <label>{t.allowance.payoutWeekday}
            <select value={payoutWeekday} onChange={(e) => setPayoutWeekday(e.target.value)}>
              {t.allowance.weekdayNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </label>}

      <label>{t.allowance.startsOn}<input required type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></label>

      <label>{t.allowance.noteLabel}<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="field-hint">{t.allowance.noteHint}</p>

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

      <button type="submit" disabled={busy}>{loading ? t.allowance.saving : t.allowance.save}</button>
      {error && <p className="error" role="alert">{error}</p>}

      {initial && <div className="form-inline-actions allowance-plan-lifecycle">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void togglePaused()}>
          {status === 'paused' ? t.allowance.resumeAction : t.allowance.pauseAction}
        </button>
        {onDelete && <button type="button" className="btn-danger" disabled={busy} onClick={() => { setDeleteError(null); setConfirmingDelete(true) }}>
          {t.allowance.deleteAction}
        </button>}
      </div>}
    </form>

    <ConfirmDestructiveActionDialog
      open={confirmingDelete}
      title={t.allowance.deleteTitle(child.display_name)}
      explanation={t.allowance.deleteExplain}
      objectName={child.display_name}
      confirmLabel={t.allowance.deleteConfirm}
      busy={deleting}
      error={deleteError}
      onCancel={() => { if (!deleting) setConfirmingDelete(false) }}
      onConfirm={handleDelete}
    />
  </>
}

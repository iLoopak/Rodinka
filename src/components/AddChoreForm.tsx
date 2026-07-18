import { useState } from 'react'
import { t } from '../strings'
import { todayISODate } from '../utils/dueDate'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { TASK_CATEGORIES, type Chore, type ChoreInput, type ChoreRecurrenceType, type TaskCategory, type TaskPriority } from '../utils/choreModel'
import { choreRecurrenceSummary } from '../utils/choreRecurrence'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

interface Props {
  members: FamilyMember[]
  currentMemberId: string
  initial?: Chore
  /** Prefill the title when creating from elsewhere (e.g. a chat message). Ignored when `initial` is given. */
  initialTitle?: string
  initialDueDate?: string
  requiresNewDueDate?: boolean
  onSubmit: (input: ChoreInput) => Promise<void>
}

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10))
}

export function AddChoreForm({ members, currentMemberId, initial, initialTitle, initialDueDate, requiresNewDueDate = false, onSubmit }: Props) {
  const defaultAssignee = members.some((member) => member.id === currentMemberId) ? currentMemberId : ''

  const [title, setTitle] = useState(initial?.title ?? initialTitle ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(initial ? initial.assigned_to ?? '' : defaultAssignee)
  const [hasDueDate, setHasDueDate] = useState(initial ? Boolean(initial.due_date) : true)
  const [dueDate, setDueDate] = useState(initial?.due_date ?? initialDueDate ?? todayISODate())
  const [rewardAmount, setRewardAmount] = useState(initial ? String(initial.reward_amount) : '')
  const [rewardEnabled, setRewardEnabled] = useState(initial?.reward_enabled ?? false)
  const [requiresApproval, setRequiresApproval] = useState(initial?.requires_approval ?? false)
  const [category, setCategory] = useState<TaskCategory | ''>(initial?.category ?? '')
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'normal')
  const [advanced, setAdvanced] = useState(Boolean(initial && (initial.description || initial.reward_enabled || initial.requires_approval || initial.category || initial.priority && initial.priority !== 'normal')))
  const [recurrenceType, setRecurrenceType] = useState<ChoreRecurrenceType>(initial?.recurrence_type ?? 'none')
  const [weekdays, setWeekdays] = useState<number[]>(initial?.recurrence_weekdays ?? WEEKDAYS)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function changeRecurrence(next: ChoreRecurrenceType) {
    setRecurrenceType(next)
    if (next === 'daily' && weekdays.length === 0) setWeekdays(WEEKDAYS)
  }

  function toggleWeekday(day: number) {
    setWeekdays((previous) => previous.includes(day)
      ? previous.filter((value) => value !== day)
      : [...previous, day].sort((a, b) => a - b))
  }

  const preferredDayOfMonth = hasDueDate && recurrenceType === 'monthly'
    ? initial?.recurrence_type === 'monthly' && dueDate === initial.due_date
      ? initial.preferred_day_of_month ?? dayOfMonth(dueDate)
      : dayOfMonth(dueDate)
    : null

  const recurrenceSummary = choreRecurrenceSummary({
    recurrence_type: recurrenceType,
    recurrence_weekdays: recurrenceType === 'daily' ? weekdays : null,
    preferred_day_of_month: preferredDayOfMonth,
    due_date: hasDueDate ? dueDate : todayISODate(),
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (assignedTo && !members.some((member) => member.id === assignedTo)) {
      setError(t.errors.generic)
      return
    }
    if (hasDueDate && !dueDate) {
      setError(t.chores.errors.dueDateRequired)
      return
    }
    if (hasDueDate && recurrenceType === 'daily' && weekdays.length === 0) {
      setError(t.chores.errors.weekdaysRequired)
      return
    }
    if (requiresNewDueDate && initial?.recurrence_type === 'none' && recurrenceType !== 'none' && dueDate === initial.due_date) {
      setError(t.chores.errors.newDueDateRequired)
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        title,
        description,
        assignedTo: assignedTo || null,
        dueDate: hasDueDate ? dueDate : null,
        rewardAmount: Number(rewardAmount) || 0,
        rewardEnabled,
        rewardCurrency: initial?.reward_currency ?? 'CZK',
        requiresApproval,
        category: category || null,
        priority,
        recurrenceType: hasDueDate ? recurrenceType : 'none',
        recurrenceWeekdays: hasDueDate && recurrenceType === 'daily' ? weekdays : null,
        preferredDayOfMonth,
      })
      if (!initial) {
        setTitle('')
        setDescription('')
        setAssignedTo(defaultAssignee)
        setDueDate(initialDueDate ?? todayISODate())
        setRewardAmount('')
        setRewardEnabled(false)
        setRequiresApproval(false)
        setCategory('')
        setPriority('normal')
        setAdvanced(false)
        setRecurrenceType('none')
        setWeekdays(WEEKDAYS)
      }
    } catch (err) {
      console.error('Failed to save chore:', err)
      setError(t.errors.generic)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="sectioned-form" onSubmit={handleSubmit}>
      <div className="form-section compact-task-form">
        <label>
          {t.chores.titleLabel}
          <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.chores.titlePlaceholder} />
        </label>
        <label>
          {t.chores.assignedToLabel}
          <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
            <option value="">{t.chores.unassigned}</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={!hasDueDate} onChange={(event) => {
            setHasDueDate(!event.target.checked)
            if (event.target.checked) setRecurrenceType('none')
          }} />
          {t.chores.noDueDate}
        </label>
        {hasDueDate && <>
        <label>
          {t.chores.dueDateLabel}
          <input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label>
          {t.chores.recurrenceLabel}
          <select value={recurrenceType} onChange={(event) => changeRecurrence(event.target.value as ChoreRecurrenceType)}>
            <option value="none">{t.chores.recurrenceNone}</option>
            <option value="daily">{t.chores.recurrenceDaily}</option>
            <option value="weekly">{t.chores.recurrenceWeekly}</option>
            <option value="monthly">{t.chores.recurrenceMonthly}</option>
          </select>
        </label>

        {recurrenceType === 'daily' && <>
          <span className="field-label" id="chore-weekdays-label">{t.chores.weekdaysLabel}</span>
          <div className="weekday-picker" role="group" aria-labelledby="chore-weekdays-label">
            {WEEKDAYS.map((day) => <button
              key={day}
              type="button"
              className={`weekday-toggle${weekdays.includes(day) ? ' active' : ''}`}
              aria-pressed={weekdays.includes(day)}
              aria-label={t.chores.weekdayNames[day - 1]}
              onClick={() => toggleWeekday(day)}
            >
              {t.chores.weekdayShortNames[day - 1]}
            </button>)}
          </div>
        </>}

        <p className="recurrence-summary" role="status">{recurrenceSummary}</p>
        </>}
      </div>

      <button type="button" className="btn-secondary" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
        {advanced ? t.chores.hideOptions : t.chores.moreOptions}
      </button>

      {advanced && <div className="form-section" data-testid="task-advanced-options">
        <label>
          {t.chores.descriptionLabel}
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t.chores.descriptionPlaceholder} />
        </label>
        <label>
          {t.chores.categoryLabel}
          <select value={category} onChange={(event) => setCategory(event.target.value as TaskCategory | '')}>
            <option value="">—</option>
            {TASK_CATEGORIES.map((value, index) => <option key={value} value={value}>{t.chores.categoryLabels[index]}</option>)}
          </select>
        </label>
        <label>
          {t.chores.priorityLabel}
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
            <option value="low">{t.chores.priorityLow}</option>
            <option value="normal">{t.chores.priorityNormal}</option>
            <option value="high">{t.chores.priorityHigh}</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={rewardEnabled} onChange={(event) => setRewardEnabled(event.target.checked)} />
          {t.chores.addReward}
        </label>
        {rewardEnabled && <label>
          {t.chores.rewardAmountLabel}
          <input required type="number" min="0" step="0.01" value={rewardAmount} onChange={(event) => setRewardAmount(event.target.value)} />
        </label>}
        <label className="checkbox-row">
          <input type="checkbox" checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} />
          {t.chores.requiresApproval}
        </label>
      </div>}

      <button type="submit" disabled={loading}>
        {loading ? t.chores.saving : initial ? t.chores.saveChanges : t.chores.addSubmit}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}

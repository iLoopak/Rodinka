import { useMemo, useState } from 'react'
import { t } from '../strings'
import { todayISODate } from '../utils/dueDate'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { Chore, ChoreInput, ChoreRecurrenceType } from '../utils/choreModel'
import { choreRecurrenceSummary } from '../utils/choreRecurrence'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

interface Props {
  members: FamilyMember[]
  currentMemberId: string
  initial?: Chore
  initialDueDate?: string
  requiresNewDueDate?: boolean
  onSubmit: (input: ChoreInput) => Promise<void>
}

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10))
}

export function AddChoreForm({ members, currentMemberId, initial, initialDueDate, requiresNewDueDate = false, onSubmit }: Props) {
  const kids = useMemo(() => members.filter((member) => member.role === 'child'), [members])
  const defaultAssignee = kids[0]?.id ?? currentMemberId

  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? defaultAssignee)
  const [dueDate, setDueDate] = useState(initial?.due_date ?? initialDueDate ?? todayISODate())
  const [rewardAmount, setRewardAmount] = useState(initial ? String(initial.reward_amount) : '')
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

  const preferredDayOfMonth = recurrenceType === 'monthly'
    ? initial?.recurrence_type === 'monthly' && dueDate === initial.due_date
      ? initial.preferred_day_of_month ?? dayOfMonth(dueDate)
      : dayOfMonth(dueDate)
    : null

  const recurrenceSummary = choreRecurrenceSummary({
    recurrence_type: recurrenceType,
    recurrence_weekdays: recurrenceType === 'daily' ? weekdays : null,
    preferred_day_of_month: preferredDayOfMonth,
    due_date: dueDate,
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!assignedTo || !members.some((member) => member.id === assignedTo)) {
      setError(t.chores.errors.assigneeRequired)
      return
    }
    if (!dueDate) {
      setError(t.chores.errors.dueDateRequired)
      return
    }
    if (recurrenceType === 'daily' && weekdays.length === 0) {
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
        assignedTo,
        dueDate,
        rewardAmount: Number(rewardAmount) || 0,
        recurrenceType,
        recurrenceWeekdays: recurrenceType === 'daily' ? weekdays : null,
        preferredDayOfMonth,
      })
      if (!initial) {
        setTitle('')
        setDescription('')
        setAssignedTo(defaultAssignee)
        setDueDate(initialDueDate ?? todayISODate())
        setRewardAmount('')
        setRecurrenceType('none')
        setWeekdays(WEEKDAYS)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="sectioned-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <h4>{t.chores.sectionDetails}</h4>
        <label>
          {t.chores.titleLabel}
          <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.chores.titlePlaceholder} />
        </label>
        <label>
          {t.chores.descriptionLabel}
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t.chores.descriptionPlaceholder} />
        </label>
        <label>
          {t.chores.assignedToLabel}
          <select required value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
            {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
          </select>
        </label>
        <label>
          {t.chores.dueDateLabel}
          <input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label>
          {t.chores.rewardAmountLabel}
          <input required type="number" min="0" step="0.01" value={rewardAmount} onChange={(event) => setRewardAmount(event.target.value)} />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.chores.recurrenceSection}</h4>
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
      </div>

      <button type="submit" disabled={loading}>
        {loading ? t.chores.saving : initial ? t.chores.saveChanges : t.chores.addSubmit}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}

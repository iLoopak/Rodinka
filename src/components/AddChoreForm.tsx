import { useMemo, useState } from 'react'
import { t } from '../strings'
import { todayISODate } from '../utils/dueDate'
import type { FamilyMember } from '../hooks/useFamilyMembers'

interface Props {
  members: FamilyMember[]
  currentMemberId: string
  initialDueDate?: string
  onSubmit: (input: {
    title: string
    description: string
    assignedTo: string
    dueDate: string
    rewardAmount: number
    recurring: boolean
  }) => Promise<void>
}

export function AddChoreForm({ members, currentMemberId, initialDueDate, onSubmit }: Props) {
  const kids = useMemo(() => members.filter((m) => m.role === 'child'), [members])
  const defaultAssignee = kids[0]?.id ?? currentMemberId

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState(defaultAssignee)
  const [dueDate, setDueDate] = useState(initialDueDate ?? todayISODate())
  const [rewardAmount, setRewardAmount] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Explicit validation rather than a silent fallback: an empty or
    // stale (no-longer-existing) assignee id must block submission, not
    // quietly default to whichever member happens to be first.
    if (!assignedTo || !members.some((m) => m.id === assignedTo)) {
      setError(t.chores.errors.assigneeRequired)
      return
    }
    if (!dueDate) {
      setError(t.chores.errors.dueDateRequired)
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
        recurring,
      })
      setTitle('')
      setDescription('')
      setAssignedTo(defaultAssignee)
      setDueDate(initialDueDate ?? todayISODate())
      setRewardAmount('')
      setRecurring(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="add-chore-form">
      <h3>{t.chores.addTitle}</h3>
      <form onSubmit={handleSubmit}>
        <label>
          {t.chores.titleLabel}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.chores.titlePlaceholder}
          />
        </label>
        <label>
          {t.chores.descriptionLabel}
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.chores.descriptionPlaceholder}
          />
        </label>
        <label>
          {t.chores.assignedToLabel}
          <select required value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.chores.dueDateLabel}
          <input
            required
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label>
          {t.chores.rewardAmountLabel}
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={rewardAmount}
            onChange={(e) => setRewardAmount(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
          />
          {t.chores.recurringLabel}
        </label>
        <button type="submit" disabled={loading}>
          {loading ? t.chores.adding : t.chores.addSubmit}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

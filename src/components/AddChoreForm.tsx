import { useState } from 'react'
import { t } from '../strings'
import type { FamilyMember } from '../hooks/useFamilyMembers'

interface Props {
  kids: FamilyMember[]
  onSubmit: (input: {
    title: string
    description: string
    assignedTo: string
    rewardAmount: number
    recurring: boolean
  }) => Promise<void>
}

export function AddChoreForm({ kids, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState(kids[0]?.id ?? '')
  const [rewardAmount, setRewardAmount] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (kids.length === 0) {
    return (
      <div className="add-chore-form">
        <h3>{t.chores.addTitle}</h3>
        <p>{t.chores.noMembers}</p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSubmit({
        title,
        description,
        assignedTo: assignedTo || kids[0].id,
        rewardAmount: Number(rewardAmount) || 0,
        recurring,
      })
      setTitle('')
      setDescription('')
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
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            {kids.map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.display_name}
              </option>
            ))}
          </select>
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

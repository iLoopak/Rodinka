import { useState } from 'react'
import { t } from '../../strings'
import { mealCategoryLabel, suggestedTagLabel } from '../../utils/mealLabels'
import type { Meal } from '../../hooks/useMeals'
import type { MealInput } from '../../context/meals/MealsContext'
import { Modal } from '../ui/Modal'
import { AddMealForm } from './AddMealForm'
import { MealIngredientsSection } from './MealIngredientsSection'

interface Props {
  meal: Meal
  onUpdate: (id: string, input: MealInput) => Promise<void>
  onAddToPlan?: (meal: Meal) => void
  onAddToVote?: (meal: Meal) => void
  onClose: () => void
}

function mealToInput(meal: Meal): MealInput {
  return {
    name: meal.name,
    description: meal.description ?? '',
    category: meal.category,
    tags: meal.tags,
    prepMinutes: meal.prep_minutes,
    notes: meal.notes ?? '',
    sourceUrl: meal.source_url ?? '',
    status: meal.status,
  }
}

export function MealDetailModal({ meal, onUpdate, onAddToPlan, onAddToVote, onClose }: Props) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (editing) {
    return (
      <Modal title={t.mealLibrary.editTitle} onClose={onClose}>
        <AddMealForm
          initial={meal}
          onSubmit={async (input) => {
            await onUpdate(meal.id, input)
            onClose()
          }}
        />
      </Modal>
    )
  }

  async function toggleArchive() {
    setBusy(true)
    setError(null)
    try {
      await onUpdate(meal.id, { ...mealToInput(meal), status: meal.status === 'active' ? 'archived' : 'active' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const metaParts = [mealCategoryLabel(meal.category), meal.prep_minutes ? `${meal.prep_minutes} min` : null].filter(
    Boolean
  )

  return (
    <Modal title={meal.name} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta">{metaParts.join(' · ')}</p>
        {meal.status === 'archived' && <span className="badge badge-pending">{t.mealLibrary.archivedBadge}</span>}
        {meal.description && <p className="row-description">{meal.description}</p>}
        {meal.tags.length > 0 && (
          <div className="tag-picker">
            {meal.tags.map((tag) => (
              <span key={tag} className="tag-toggle active" role="presentation">
                {suggestedTagLabel(tag)}
              </span>
            ))}
          </div>
        )}
        {meal.notes && <p className="row-description">{meal.notes}</p>}
        {meal.source_url && (
          <p className="row-meta">
            <a href={meal.source_url} target="_blank" rel="noreferrer">
              {meal.source_url}
            </a>
          </p>
        )}
      </div>

      <MealIngredientsSection mealId={meal.id} />

      <div className="family-actions">
        {onAddToPlan && meal.status === 'active' && (
          <button
            onClick={() => {
              onAddToPlan(meal)
              onClose()
            }}
          >
            {t.mealLibrary.addToPlanAction}
          </button>
        )}
        {onAddToVote && meal.status === 'active' && (
          <button
            className="btn-secondary"
            onClick={() => {
              onAddToVote(meal)
              onClose()
            }}
          >
            {t.mealLibrary.addToVoteAction}
          </button>
        )}
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          {t.mealLibrary.edit}
        </button>
        <button className="btn-secondary" onClick={toggleArchive} disabled={busy}>
          {meal.status === 'active' ? t.mealLibrary.archiveAction : t.mealLibrary.restoreAction}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  )
}

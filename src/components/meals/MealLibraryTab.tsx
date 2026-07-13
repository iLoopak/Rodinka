import { useState } from 'react'
import { t } from '../../strings'
import { useFamilyData } from '../../context/FamilyDataContext'
import { todayISODate } from '../../utils/dueDate'
import { MEAL_CATEGORY_VALUES, mealBadgeLabel, mealCategoryLabel, suggestedTagLabel, SUGGESTED_MEAL_TAGS } from '../../utils/mealLabels'
import { getMealBadges } from '../../utils/mealSuggestions'
import { onActivateKey } from '../../utils/a11y'
import { Modal } from '../ui/Modal'
import { EmptyState } from '../ui/EmptyState'
import { AddMealForm } from './AddMealForm'
import { MealDetailModal } from './MealDetailModal'
import type { Meal } from '../../hooks/useMeals'
import type { MealInput } from '../../context/useMealsData'

interface Props {
  onAddToPlan?: (meal: Meal) => void
  onAddToVote?: (meal: Meal) => void
}

export function MealLibraryTab({ onAddToPlan, onAddToVote }: Props) {
  const { meals, planEntries, voteRounds, isParentOrAdmin, addMeal, updateMeal } = useFamilyData()
  const [showAdd, setShowAdd] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const today = todayISODate()
  const badgeCtx = { meals, planEntries, voteRounds, today }

  const filtered = meals.filter((meal) => {
    if (meal.status !== (showArchived ? 'archived' : 'active')) return false
    if (filterCategory && meal.category !== filterCategory) return false
    if (filterTag && !meal.tags.includes(filterTag)) return false
    if (search.trim() && !meal.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  const hasFilters = filterCategory !== '' || filterTag !== '' || search.trim() !== ''
  function clearFilters() {
    setFilterCategory('')
    setFilterTag('')
    setSearch('')
  }

  async function handleAdd(input: MealInput) {
    await addMeal(input)
    setShowAdd(false)
  }

  return (
    <>
      {isParentOrAdmin && (
        <div className="tab-toolbar">
          <button type="button" className="header-action-button" onClick={() => setShowAdd(true)}>
            <span aria-hidden="true">+</span> {t.mealLibrary.addAction}
          </button>
        </div>
      )}

      <div className="filter-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.mealLibrary.searchPlaceholder}
          aria-label={t.mealLibrary.searchPlaceholder}
        />
      </div>
      <div className="filter-row">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} aria-label={t.mealLibrary.filterCategoryLabel}>
          <option value="">
            {t.mealLibrary.filterCategoryLabel}: {t.mealLibrary.filterAll}
          </option>
          {MEAL_CATEGORY_VALUES.map((category) => (
            <option key={category} value={category}>
              {mealCategoryLabel(category)}
            </option>
          ))}
        </select>
        <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} aria-label={t.mealLibrary.filterTagLabel}>
          <option value="">
            {t.mealLibrary.filterTagLabel}: {t.mealLibrary.filterAll}
          </option>
          {SUGGESTED_MEAL_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {suggestedTagLabel(tag)}
            </option>
          ))}
        </select>
      </div>
      <label className="checkbox-label">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        {t.mealLibrary.showArchived}
      </label>

      {filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState title={t.mealLibrary.noSearchResults} action={{ label: t.mealLibrary.clearFilters, onClick: clearFilters }} />
        ) : (
          <EmptyState
            title={t.mealLibrary.noMeals}
            action={isParentOrAdmin ? { label: t.mealLibrary.noMealsAction, onClick: () => setShowAdd(true) } : undefined}
          />
        )
      ) : (
        <ul className="section-list">
          {filtered.map((meal) => (
            <li
              key={meal.id}
              className="clickable-row"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedMeal(meal)}
              onKeyDown={onActivateKey(() => setSelectedMeal(meal))}
            >
              <span className="row-title">{meal.name}</span>
              <span className="row-meta">{mealCategoryLabel(meal.category)}</span>
              <span className="row-spacer" />
              {getMealBadges(meal, badgeCtx).map((badge) => (
                <span key={badge} className="badge badge-pending">
                  {mealBadgeLabel(badge)}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <Modal title={t.mealLibrary.addTitle} onClose={() => setShowAdd(false)}>
          <AddMealForm onSubmit={handleAdd} />
        </Modal>
      )}

      {selectedMeal && (
        <MealDetailModal
          meal={selectedMeal}
          onUpdate={updateMeal}
          onAddToPlan={onAddToPlan}
          onAddToVote={onAddToVote}
          onClose={() => setSelectedMeal(null)}
        />
      )}
    </>
  )
}

import { useState } from 'react'
import { t } from '../../strings'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useMealsDataContext } from '../../context/meals/MealsContext'
import { todayISODate } from '../../utils/dueDate'
import { MEAL_CATEGORY_VALUES, mealBadgeLabel, mealCategoryLabel, suggestedTagLabel, SUGGESTED_MEAL_TAGS } from '../../utils/mealLabels'
import { getMealBadges } from '../../utils/mealSuggestions'
import { onActivateKey } from '../../utils/a11y'
import { Modal } from '../ui/Modal'
import { EmptyState } from '../ui/EmptyState'
import { AddMealForm } from './AddMealForm'
import { MealDetailModal } from './MealDetailModal'
import type { Meal } from '../../hooks/useMeals'
import type { MealInput } from '../../context/meals/MealsContext'
import { FilterDisclosure, FilterDisclosurePanel, FilterDisclosureToggle } from '../ui/FilterDisclosure'

interface Props {
  onAddToPlan?: (meal: Meal) => void
  onAddToVote?: (meal: Meal) => void
}

export function MealLibraryTab({ onAddToPlan, onAddToVote }: Props) {
  const { isParentOrAdmin } = useFamilyCore()
  const { meals, planEntries, voteRounds, addMeal, updateMeal } = useMealsDataContext()
  const [showAdd, setShowAdd] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

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
    setShowArchived(false)
  }

  async function handleAdd(input: MealInput) {
    await addMeal(input)
    setShowAdd(false)
  }

  return (
    <>
      <FilterDisclosure id="meal-library-filter-panel" open={filtersOpen} onOpenChange={setFiltersOpen}
        activeCount={Number(Boolean(filterCategory)) + Number(Boolean(filterTag)) + Number(showArchived)} onClear={clearFilters}>
      <div className="tab-toolbar">
        {isParentOrAdmin && (
          <button type="button" className="header-action-button" onClick={() => setShowAdd(true)}>
            <span aria-hidden="true">+</span> {t.mealLibrary.addAction}
          </button>
        )}
        <div className="header-actions tab-toolbar-actions">
          <FilterDisclosureToggle />
        </div>
      </div>

      <div className="filter-row meal-search-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.mealLibrary.searchPlaceholder}
          aria-label={t.mealLibrary.searchPlaceholder}
        />
      </div>
      <FilterDisclosurePanel>
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
      </FilterDisclosurePanel>
      </FilterDisclosure>

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
        <div className="panel is-primary">
          <ul className="section-list plain-list">
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
        </div>
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

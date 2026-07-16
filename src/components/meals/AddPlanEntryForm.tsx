import { useState } from 'react'
import { t } from '../../strings'
import { todayISODate } from '../../utils/dueDate'
import { MEAL_PLAN_STATUS_VALUES, MEAL_SLOT_VALUES, mealPlanStatusLabel, mealSlotLabel } from '../../utils/mealLabels'
import { recentlyUsedMeals } from '../../utils/mealSuggestions'
import { isValidPlanEntryInput } from '../../utils/mealPlanGrouping'
import type { Meal } from '../../hooks/useMeals'
import type { MealPlanEntry, MealPlanStatus, MealSlot } from '../../hooks/useMealPlanEntries'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import type { PlanEntryInput } from '../../context/meals/MealsContext'

const SLOT_OPTIONS = MEAL_SLOT_VALUES.map((value) => ({ value, label: mealSlotLabel(value) }))
const STATUS_OPTIONS = MEAL_PLAN_STATUS_VALUES.map((value) => ({ value, label: mealPlanStatusLabel(value) }))

interface Props {
  meals: Meal[]
  members: FamilyMember[]
  planEntries: MealPlanEntry[]
  initial?: MealPlanEntry
  defaultDate?: string
  defaultSlot?: MealSlot
  prefill?: { mealId: string | null; title: string }
  onSubmit: (input: PlanEntryInput) => Promise<void>
}

export function AddPlanEntryForm({ meals, members, planEntries, initial, defaultDate, defaultSlot, prefill, onSubmit }: Props) {
  const activeMeals = meals.filter((meal) => meal.status === 'active')
  const initialMealId = initial?.meal_id ?? prefill?.mealId ?? null

  const [entryDate, setEntryDate] = useState(initial?.entry_date ?? defaultDate ?? todayISODate())
  const [mealSlot, setMealSlot] = useState<MealSlot>(initial?.meal_slot ?? defaultSlot ?? 'dinner')
  const [useLibrary, setUseLibrary] = useState(initialMealId !== null || activeMeals.length > 0)
  const [selectedMealId, setSelectedMealId] = useState(initialMealId ?? activeMeals[0]?.id ?? '')
  const [customTitle, setCustomTitle] = useState(initialMealId ? '' : (initial?.title ?? prefill?.title ?? ''))
  const [responsibleMemberId, setResponsibleMemberId] = useState(initial?.responsible_member_id ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [status, setStatus] = useState<MealPlanStatus>(initial?.status ?? 'proposed')

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const suggestions = recentlyUsedMeals(meals, planEntries, todayISODate(), 14).slice(0, 5)

  function pickSuggestion(meal: Meal) {
    setUseLibrary(true)
    setSelectedMealId(meal.id)
  }

  function markLeftovers() {
    setUseLibrary(false)
    setCustomTitle(t.mealLibrary.tagLeftovers)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const mealId = useLibrary ? selectedMealId || null : null
    const title = useLibrary ? (activeMeals.find((m) => m.id === selectedMealId)?.name ?? '') : customTitle

    if (!isValidPlanEntryInput({ mealId, title })) {
      setError(t.mealPlan.errors.entryTitleRequired)
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        entryDate,
        mealSlot,
        mealId,
        title,
        responsibleMemberId: responsibleMemberId || null,
        notes,
        status,
        origin: initial?.origin ?? (prefill ? 'vote' : 'manual'),
        sourceEntryId: initial?.source_entry_id ?? null,
      })
    } catch (err) {
      console.error('Failed to save meal plan entry:', err)
      setError(t.errors.generic)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="sectioned-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <label>
          {t.mealPlan.dateLabel}
          <input required type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </label>
        <label>
          {t.mealPlan.slotLabel}
          <select value={mealSlot} onChange={(e) => setMealSlot(e.target.value as MealSlot)}>
            {SLOT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-section">
        {suggestions.length > 0 && (
          <>
            <h4>{t.mealPlan.recentMealsLabel}</h4>
            <div className="tag-picker">
              {suggestions.map((meal) => (
                <button key={meal.id} type="button" className="tag-toggle" onClick={() => pickSuggestion(meal)}>
                  {meal.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={useLibrary}
            className={`tab-button${useLibrary ? ' active' : ''}`}
            onClick={() => setUseLibrary(true)}
          >
            {t.mealPlan.useLibraryMealLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!useLibrary}
            className={`tab-button${!useLibrary ? ' active' : ''}`}
            onClick={() => setUseLibrary(false)}
          >
            {t.mealPlan.useCustomTitleAction}
          </button>
        </div>
        {useLibrary ? (
          activeMeals.length === 0 ? (
            <p className="empty-state">{t.mealLibrary.noMeals}</p>
          ) : (
            <label>
              {t.mealPlan.useLibraryMealLabel}
              <select value={selectedMealId} onChange={(e) => setSelectedMealId(e.target.value)}>
                {activeMeals.map((meal) => (
                  <option key={meal.id} value={meal.id}>
                    {meal.name}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : (
          <label>
            {t.mealPlan.customTitleLabel}
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={t.mealPlan.customTitlePlaceholder}
            />
          </label>
        )}
        <button type="button" className="btn-secondary" onClick={markLeftovers}>
          {t.mealPlan.markLeftoversAction}
        </button>
      </div>

      <div className="form-section">
        <label>
          {t.mealPlan.responsibleLabel}
          <select value={responsibleMemberId} onChange={(e) => setResponsibleMemberId(e.target.value)}>
            <option value="">{t.mealPlan.responsibleNone}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-section">
        <label>
          {t.mealPlan.statusLabel}
          <select value={status} onChange={(e) => setStatus(e.target.value as MealPlanStatus)}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.mealPlan.notesLabel}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? t.mealPlan.submitting : initial ? t.mealPlan.submitSave : t.mealPlan.submitAdd}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}

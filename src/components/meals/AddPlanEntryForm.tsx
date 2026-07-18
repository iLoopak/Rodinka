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
import { DateShortcutField, GuidedDisclosure, GuidedLead, MemberChoicePicker } from '../create-record/GuidedCreateFields'

const SLOT_OPTIONS = MEAL_SLOT_VALUES.map((value) => ({ value, label: mealSlotLabel(value) }))
const STATUS_OPTIONS = MEAL_PLAN_STATUS_VALUES.map((value) => ({ value, label: mealPlanStatusLabel(value) }))

interface Props {
  meals: Meal[]
  members: FamilyMember[]
  planEntries: MealPlanEntry[]
  initial?: MealPlanEntry
  defaultDate?: string
  defaultSlot?: MealSlot
  initialMemberId?: string
  prefill?: { mealId: string | null; title: string }
  variant?: 'standard' | 'guided'
  onSubmit: (input: PlanEntryInput) => Promise<void>
}

export function AddPlanEntryForm({ meals, members, planEntries, initial, defaultDate, defaultSlot, initialMemberId, prefill, variant = 'standard', onSubmit }: Props) {
  const activeMeals = meals.filter((meal) => meal.status === 'active')
  const initialMealId = initial?.meal_id ?? prefill?.mealId ?? null

  const [entryDate, setEntryDate] = useState(initial?.entry_date ?? defaultDate ?? todayISODate())
  const [mealSlot, setMealSlot] = useState<MealSlot>(initial?.meal_slot ?? defaultSlot ?? 'dinner')
  const [useLibrary, setUseLibrary] = useState(variant === 'guided' ? initialMealId !== null : initialMealId !== null || activeMeals.length > 0)
  const [selectedMealId, setSelectedMealId] = useState(initialMealId ?? activeMeals[0]?.id ?? '')
  const [customTitle, setCustomTitle] = useState(initialMealId ? '' : (initial?.title ?? prefill?.title ?? ''))
  const contextualMemberId = initialMemberId && members.some((member) => member.id === initialMemberId) ? initialMemberId : ''
  const [responsibleMemberId, setResponsibleMemberId] = useState(initial?.responsible_member_id ?? contextualMemberId)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [status, setStatus] = useState<MealPlanStatus>(initial?.status ?? 'proposed')

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

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

  if (variant === 'guided' && !initial) {
    return <form className="guided-create-form" onSubmit={handleSubmit}>
      <div className="guided-create-scroll">
        <GuidedLead />
        <section className="guided-primary-section">
          <span className="guided-field-label">{t.create.guided.mealPrompt}</span>
          {suggestions.length > 0 && <div className="guided-suggestion-row" aria-label={t.mealPlan.suggestionsLabel}>
            {suggestions.map((meal) => <button
              key={meal.id}
              type="button"
              className={useLibrary && selectedMealId === meal.id ? 'selected' : ''}
              aria-pressed={useLibrary && selectedMealId === meal.id}
              onClick={() => pickSuggestion(meal)}
            >{meal.name}</button>)}
          </div>}
          <div className="guided-segmented compact" role="group" aria-label={t.create.guided.mealSource}>
            <button type="button" className={useLibrary ? 'selected' : ''} aria-pressed={useLibrary} onClick={() => setUseLibrary(true)}>{t.mealPlan.useLibraryMealLabel}</button>
            <button type="button" className={!useLibrary ? 'selected' : ''} aria-pressed={!useLibrary} onClick={() => setUseLibrary(false)}>{t.mealPlan.useCustomTitleAction}</button>
          </div>
          {useLibrary ? activeMeals.length === 0 ? <p className="empty-state">{t.mealLibrary.noMeals}</p> : <label className="guided-hero-field compact">
            <span>{t.create.guided.chooseMeal}</span>
            <select value={selectedMealId} onChange={(event) => setSelectedMealId(event.target.value)}>
              <option value="" disabled>{t.mealPlan.chooseFromLibraryAction}</option>
              {activeMeals.map((meal) => <option key={meal.id} value={meal.id}>{meal.name}</option>)}
            </select>
          </label> : <label className="guided-hero-field compact">
            <span>{t.create.guided.customMeal}</span>
            <input autoFocus value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder={t.mealPlan.customTitlePlaceholder} />
          </label>}
          <button type="button" className="guided-text-action" onClick={markLeftovers}>{t.mealPlan.markLeftoversAction}</button>
        </section>

        <DateShortcutField label={t.create.guided.mealDate} value={entryDate} required onChange={setEntryDate} />
        <fieldset className="guided-choice-fieldset">
          <legend>{t.mealPlan.slotLabel}</legend>
          <div className="guided-option-grid compact">
            {SLOT_OPTIONS.map((option) => <button
              key={option.value}
              type="button"
              className={mealSlot === option.value ? 'selected' : ''}
              aria-pressed={mealSlot === option.value}
              onClick={() => setMealSlot(option.value)}
            >{option.label}</button>)}
          </div>
        </fieldset>

        <GuidedDisclosure open={detailsOpen} onToggle={() => setDetailsOpen((open) => !open)}>
          <MemberChoicePicker label={t.mealPlan.responsibleLabel} members={members} value={responsibleMemberId} emptyLabel={t.mealPlan.responsibleNone} onChange={setResponsibleMemberId} />
          <label>
            <span>{t.mealPlan.statusLabel}</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as MealPlanStatus)}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          </label>
          <label><span>{t.mealPlan.notesLabel}</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </GuidedDisclosure>
      </div>
      <div className="guided-create-footer">
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? t.mealPlan.submitting : t.mealPlan.submitAdd}</button>
      </div>
    </form>
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

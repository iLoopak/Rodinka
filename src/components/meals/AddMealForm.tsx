import { useState } from 'react'
import { t } from '../../strings'
import { MEAL_CATEGORY_VALUES, mealCategoryLabel, suggestedTagLabel, SUGGESTED_MEAL_TAGS } from '../../utils/mealLabels'
import type { MealInput } from '../../context/meals/MealsContext'
import type { Meal, MealCategory } from '../../features/meals/domain/mealTypes'
import { GuidedDisclosure, GuidedLead } from '../create-record/GuidedCreateFields'

const CATEGORY_OPTIONS = MEAL_CATEGORY_VALUES.map((value) => ({ value, label: mealCategoryLabel(value) }))

interface Props {
  initial?: Meal
  initialName?: string
  variant?: 'standard' | 'guided'
  onSubmit: (input: MealInput) => Promise<void>
}

export function AddMealForm({ initial, initialName, variant = 'standard', onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? initialName ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState<MealCategory>(initial?.category ?? 'dinner')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [customTagInput, setCustomTagInput] = useState('')
  const [prepMinutes, setPrepMinutes] = useState(initial?.prep_minutes != null ? String(initial.prep_minutes) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '')

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function addCustomTag() {
    const trimmed = customTagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed])
    }
    setCustomTagInput('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError(t.mealLibrary.errors.nameRequired)
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        name,
        description,
        category,
        tags,
        prepMinutes: prepMinutes ? Number(prepMinutes) : null,
        notes,
        sourceUrl,
        status: initial?.status ?? 'active',
      })
    } catch (err) {
      console.error('Failed to save meal:', err)
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
          <label className="guided-hero-field">
            <span>{t.create.guided.libraryPrompt}</span>
            <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder={t.mealLibrary.namePlaceholder} />
          </label>
          <fieldset className="guided-choice-fieldset">
            <legend>{t.mealLibrary.categoryLabel}</legend>
            <div className="guided-option-grid compact">
              {CATEGORY_OPTIONS.map((option) => <button
                key={option.value}
                type="button"
                className={category === option.value ? 'selected' : ''}
                aria-pressed={category === option.value}
                onClick={() => setCategory(option.value)}
              >{option.label}</button>)}
            </div>
          </fieldset>
        </section>

        <GuidedDisclosure open={detailsOpen} onToggle={() => setDetailsOpen((open) => !open)}>
          <label><span>{t.mealLibrary.descriptionLabel}</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label><span>{t.mealLibrary.prepMinutesLabel}</span><input type="number" min="0" step="1" inputMode="numeric" value={prepMinutes} onChange={(event) => setPrepMinutes(event.target.value)} /></label>
          <fieldset className="guided-choice-fieldset">
            <legend>{t.mealLibrary.tagsLabel}</legend>
            <div className="guided-suggestion-row wrap">
              {SUGGESTED_MEAL_TAGS.map((tag) => <button
                key={tag}
                type="button"
                className={tags.includes(tag) ? 'selected' : ''}
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >{suggestedTagLabel(tag)}</button>)}
              {tags.filter((tag) => !(SUGGESTED_MEAL_TAGS as readonly string[]).includes(tag)).map((tag) => <button key={tag} type="button" className="selected" aria-pressed="true" onClick={() => toggleTag(tag)}>{tag}</button>)}
            </div>
          </fieldset>
          <div className="guided-inline-add">
            <input
              value={customTagInput}
              onChange={(event) => setCustomTagInput(event.target.value)}
              placeholder={t.mealLibrary.customTagPlaceholder}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addCustomTag()
                }
              }}
            />
            <button type="button" className="btn-secondary" onClick={addCustomTag}>{t.mealLibrary.addCustomTagAction}</button>
          </div>
          <label><span>{t.mealLibrary.notesLabel}</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <label><span>{t.mealLibrary.sourceUrlLabel}</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
        </GuidedDisclosure>
      </div>
      <div className="guided-create-footer">
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? t.mealLibrary.submitting : t.mealLibrary.submitAdd}</button>
      </div>
    </form>
  }

  return (
    <form className="sectioned-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <h4>{t.mealLibrary.sectionBasic}</h4>
        <label>
          {t.mealLibrary.nameLabel}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.mealLibrary.namePlaceholder}
          />
        </label>
        <label>
          {t.mealLibrary.descriptionLabel}
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.mealLibrary.sectionCategoryTags}</h4>
        <label>
          {t.mealLibrary.categoryLabel}
          <select value={category} onChange={(e) => setCategory(e.target.value as MealCategory)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="tag-picker" role="group" aria-label={t.mealLibrary.tagsLabel}>
          {SUGGESTED_MEAL_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`tag-toggle${tags.includes(tag) ? ' active' : ''}`}
              aria-pressed={tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {suggestedTagLabel(tag)}
            </button>
          ))}
          {tags
            .filter((tag) => !(SUGGESTED_MEAL_TAGS as readonly string[]).includes(tag))
            .map((tag) => (
              <button key={tag} type="button" className="tag-toggle active" onClick={() => toggleTag(tag)}>
                {tag}
              </button>
            ))}
        </div>
        <div className="inline-add-row">
          <input
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            placeholder={t.mealLibrary.customTagPlaceholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomTag()
              }
            }}
          />
          <button type="button" className="btn-secondary" onClick={addCustomTag}>
            {t.mealLibrary.addCustomTagAction}
          </button>
        </div>
      </div>

      <div className="form-section">
        <h4>{t.mealLibrary.sectionPrep}</h4>
        <label>
          {t.mealLibrary.prepMinutesLabel}
          <input
            type="number"
            min="0"
            step="1"
            value={prepMinutes}
            onChange={(e) => setPrepMinutes(e.target.value)}
          />
        </label>
      </div>

      <div className="form-section">
        <h4>{t.mealLibrary.sectionNotesSource}</h4>
        <label>
          {t.mealLibrary.notesLabel}
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label>
          {t.mealLibrary.sourceUrlLabel}
          <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </label>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? t.mealLibrary.submitting : initial ? t.mealLibrary.submitSave : t.mealLibrary.submitAdd}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}

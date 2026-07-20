import { useState } from 'react'
import { t } from '../../strings'
import type { Meal } from '../../features/meals/domain/mealTypes'
import type { VoteRoundInput } from '../../context/meals/MealsContext'
import { GuidedDisclosure, GuidedLead } from '../create-record/GuidedCreateFields'

interface Props {
  meals: Meal[]
  initialMealId?: string
  variant?: 'standard' | 'guided'
  onSubmit: (input: VoteRoundInput, openImmediately: boolean) => Promise<void>
}

export function CreateRoundForm({ meals, initialMealId, variant = 'standard', onSubmit }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [selectedMealIds, setSelectedMealIds] = useState<string[]>(initialMealId ? [initialMealId] : [])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const activeMeals = meals.filter((meal) => meal.status === 'active')

  function toggleMeal(id: string) {
    setSelectedMealIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  function goNext() {
    if (step === 1) {
      if (!title.trim()) {
        setError(t.mealVoting.errors.roundTitleRequired)
        return
      }
      setError(null)
      setStep(2)
    } else if (step === 2) {
      if (selectedMealIds.length === 0) {
        setError(t.mealVoting.errors.candidatesRequired)
        return
      }
      setError(null)
      setStep(3)
    }
  }

  function goBack() {
    setError(null)
    setStep((s) => (s === 3 ? 2 : 1))
  }

  async function handleFinish(openImmediately: boolean) {
    if (!title.trim()) {
      setError(t.mealVoting.errors.roundTitleRequired)
      return
    }
    if (selectedMealIds.length === 0) {
      setError(t.mealVoting.errors.candidatesRequired)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onSubmit(
        {
          title,
          description,
          deadlineAt: deadline ? new Date(deadline).toISOString() : null,
          mealIds: selectedMealIds,
        },
        openImmediately
      )
    } catch (err) {
      console.error('Failed to create meal vote:', err)
      setError(t.errors.generic)
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'guided') {
    return <div className="guided-create-form">
      <div className="guided-create-scroll">
        <GuidedLead />
        <section className="guided-primary-section">
          <label className="guided-hero-field">
            <span>{t.create.guided.votePrompt}</span>
            <input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.mealVoting.roundTitlePlaceholder} />
          </label>
        </section>
        <fieldset className="guided-choice-fieldset">
          <legend>{t.create.guided.voteCandidates}</legend>
          {activeMeals.length === 0 ? <p className="empty-state">{t.mealLibrary.noMeals}</p> : <div className="guided-candidate-grid">
            {activeMeals.map((meal) => {
              const selected = selectedMealIds.includes(meal.id)
              return <button
                key={meal.id}
                type="button"
                className={selected ? 'selected' : ''}
                aria-pressed={selected}
                onClick={() => toggleMeal(meal.id)}
              ><span>{meal.name}</span><span aria-hidden="true">{selected ? '✓' : '+'}</span></button>
            })}
          </div>}
        </fieldset>
        <GuidedDisclosure open={detailsOpen} onToggle={() => setDetailsOpen((open) => !open)}>
          <label><span>{t.mealVoting.roundDescriptionLabel}</span><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label><span>{t.mealVoting.roundDeadlineLabel}</span><input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        </GuidedDisclosure>
      </div>
      <div className="guided-create-footer split">
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="btn-secondary" onClick={() => handleFinish(false)} disabled={loading}>{t.create.guided.saveVoteDraft}</button>
        <button type="button" onClick={() => handleFinish(true)} disabled={loading}>{loading ? t.mealVoting.submitting : t.create.guided.startVote}</button>
      </div>
    </div>
  }

  return (
    <div className="sectioned-form">
      {step === 1 && (
        <div className="form-section">
          <h4>{t.mealVoting.createRoundTitle}</h4>
          <label>
            {t.mealVoting.roundTitleLabel}
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.mealVoting.roundTitlePlaceholder}
            />
          </label>
          <label>
            {t.mealVoting.roundDescriptionLabel}
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            {t.mealVoting.roundDeadlineLabel}
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <button type="button" onClick={goNext}>
            {t.mealVoting.addCandidatesAction}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="form-section">
          <h4>{t.mealVoting.selectCandidatesTitle}</h4>
          {activeMeals.length === 0 ? (
            <p className="empty-state">{t.mealLibrary.noMeals}</p>
          ) : (
            <ul className="section-list plain-list">
              {activeMeals.map((meal) => (
                <li key={meal.id}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedMealIds.includes(meal.id)}
                      onChange={() => toggleMeal(meal.id)}
                    />
                    {meal.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="family-actions">
            <button type="button" className="btn-secondary" onClick={goBack}>
              {t.mealVoting.cancel}
            </button>
            <button type="button" onClick={goNext}>
              {t.mealVoting.reviewAndOpenTitle}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="form-section">
          <h4>{t.mealVoting.reviewAndOpenTitle}</h4>
          <p className="row-title">{title}</p>
          <ul className="section-list plain-list">
            {selectedMealIds.map((id) => (
              <li key={id}>
                <span className="row-title">{activeMeals.find((meal) => meal.id === id)?.name}</span>
              </li>
            ))}
          </ul>
          <div className="family-actions">
            <button type="button" className="btn-secondary" onClick={goBack} disabled={loading}>
              {t.mealVoting.cancel}
            </button>
            <button type="button" className="btn-secondary" onClick={() => handleFinish(false)} disabled={loading}>
              {t.mealVoting.createDraftAction}
            </button>
            <button type="button" onClick={() => handleFinish(true)} disabled={loading}>
              {loading ? t.mealVoting.submitting : t.mealVoting.openRoundAction}
            </button>
          </div>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}

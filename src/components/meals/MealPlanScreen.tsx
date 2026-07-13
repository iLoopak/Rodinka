import { useState } from 'react'
import { t } from '../../strings'
import { useFamilyData } from '../../context/FamilyDataContext'
import { ErrorState } from '../ui/ErrorState'
import { MealLibraryTab } from './MealLibraryTab'
import { VoteTab } from './VoteTab'
import { PlanTab, type PlanPrefill } from './PlanTab'
import type { Meal } from '../../hooks/useMeals'

type Tab = 'plan' | 'vote' | 'meals'

function initialTab(): Tab {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'vote' || hash === 'meals') return hash
  return 'plan'
}

export function MealPlanScreen() {
  const { loading, error, refreshAll } = useFamilyData()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [planPrefill, setPlanPrefill] = useState<PlanPrefill | undefined>(undefined)
  const [voteMealPrefill, setVoteMealPrefill] = useState<string | undefined>(undefined)

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  function handleAddToPlan(meal: Meal) {
    setPlanPrefill({ mealId: meal.id, title: meal.name })
    setTab('plan')
  }

  function handleAddToVote(meal: Meal) {
    setVoteMealPrefill(meal.id)
    setTab('vote')
  }

  function handleAddWinnerToPlan(winner: { mealId: string | null; title: string }) {
    setPlanPrefill(winner)
    setTab('plan')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'plan', label: t.meals.tabPlan },
    { id: 'vote', label: t.meals.tabVote },
    { id: 'meals', label: t.meals.tabMeals },
  ]

  return (
    <>
      <div className="home-header">
        <h1 className="home-title">{t.meals.title}</h1>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.id}
            className={`tab-button${tab === tabItem.id ? ' active' : ''}`}
            onClick={() => setTab(tabItem.id)}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'plan' && <PlanTab prefill={planPrefill} onPrefillConsumed={() => setPlanPrefill(undefined)} />}
      {tab === 'vote' && (
        <VoteTab
          onAddWinnerToPlan={handleAddWinnerToPlan}
          prefillMealId={voteMealPrefill}
          onPrefillConsumed={() => setVoteMealPrefill(undefined)}
        />
      )}
      {tab === 'meals' && <MealLibraryTab onAddToPlan={handleAddToPlan} onAddToVote={handleAddToVote} />}
    </>
  )
}

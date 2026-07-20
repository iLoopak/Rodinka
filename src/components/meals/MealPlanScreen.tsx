import { useState } from 'react'
import { t } from '../../strings'
import { useMealsDataContext } from '../../context/meals/MealsContext'
import { ErrorState } from '../ui/ErrorState'
import { MealLibraryTab } from './MealLibraryTab'
import { VoteTab } from './VoteTab'
import { PlanTab, type PlanPrefill } from './PlanTab'
import type { Meal } from '../../features/meals/domain/mealTypes'
import { ScrollableTabs } from '../ui/ScrollableTabs'
import { ScreenHeader } from '../ui/ScreenHeader'

type Tab = 'plan' | 'vote' | 'meals'

function initialTab(): Tab {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'vote' || hash === 'meals') return hash
  return 'plan'
}

export function MealPlanScreen() {
  const { loading, error, refreshMealsData: refreshAll } = useMealsDataContext()
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
      <ScreenHeader title={t.meals.title} />

      <ScrollableTabs tabs={tabs} activeTab={tab} onChange={setTab} />

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

import { createContext, useContext, type ReactNode } from 'react'
import { useMealsDataSource } from './useMealsDataSource'

export type { MealInput, PlanEntryInput, VoteRoundInput, Meal, MealPlanEntry } from './useMealsDataSource'

type MealsContextValue = ReturnType<typeof useMealsDataSource>

const MealsContext = createContext<MealsContextValue | null>(null)

interface ProviderProps {
  familyId: string
  userId: string
  children: ReactNode
}

export function MealsProvider({ familyId, userId, children }: ProviderProps) {
  const value = useMealsDataSource(familyId, userId)
  return <MealsContext.Provider value={value}>{children}</MealsContext.Provider>
}

export function useMealsDataContext() {
  const ctx = useContext(MealsContext)
  if (!ctx) throw new Error('useMealsDataContext must be used within a MealsProvider')
  return ctx
}

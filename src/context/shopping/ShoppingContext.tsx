import { createContext, useContext, type ReactNode } from 'react'
import { useShoppingDataSource } from './useShoppingDataSource'

type ShoppingContextValue = ReturnType<typeof useShoppingDataSource>

const ShoppingContext = createContext<ShoppingContextValue | null>(null)

interface ProviderProps {
  familyId: string
  currentMemberId: string
  children: ReactNode
}

export function ShoppingProvider({ familyId, currentMemberId, children }: ProviderProps) {
  const value = useShoppingDataSource(familyId, currentMemberId)
  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>
}

export function useShopping() {
  const ctx = useContext(ShoppingContext)
  if (!ctx) throw new Error('useShopping must be used within a ShoppingProvider')
  return ctx
}

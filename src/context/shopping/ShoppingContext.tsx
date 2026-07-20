import { createContext, useContext, type ReactNode } from 'react'
import { useShoppingDataSource } from './useShoppingDataSource'

type ShoppingContextValue = ReturnType<typeof useShoppingDataSource>
type ShoppingSyncStatus = ShoppingContextValue['shoppingSyncStatus']

const ShoppingContext = createContext<ShoppingContextValue | null>(null)
const ShoppingSyncStatusContext = createContext<ShoppingSyncStatus | null>(null)

interface ProviderProps {
  familyId: string
  userId: string
  currentMemberId: string
  children: ReactNode
}

export function ShoppingProvider({ familyId, userId, currentMemberId, children }: ProviderProps) {
  const value = useShoppingDataSource(familyId, userId, currentMemberId)
  return (
    <ShoppingSyncStatusContext.Provider value={value.shoppingSyncStatus}>
      <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>
    </ShoppingSyncStatusContext.Provider>
  )
}

export function useShopping() {
  const ctx = useContext(ShoppingContext)
  if (!ctx) throw new Error('useShopping must be used within a ShoppingProvider')
  return ctx
}

export function useShoppingSyncStatus() {
  const status = useContext(ShoppingSyncStatusContext)
  if (status === null) throw new Error('useShoppingSyncStatus must be used within a ShoppingProvider')
  return status
}

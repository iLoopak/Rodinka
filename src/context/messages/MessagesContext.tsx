import { createContext, useContext, type ReactNode } from 'react'
import { useMessagesDataSource, type MessagesDataSource } from './useMessagesDataSource'

const MessagesContext = createContext<MessagesDataSource | null>(null)

interface ProviderProps {
  familyId: string
  currentMemberId: string
  children: ReactNode
}

export function MessagesProvider({ familyId, currentMemberId, children }: ProviderProps) {
  const value = useMessagesDataSource({ familyId, currentMemberId })
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
}

export function useMessagesData(): MessagesDataSource {
  const ctx = useContext(MessagesContext)
  if (!ctx) throw new Error('useMessagesData must be used within a MessagesProvider')
  return ctx
}

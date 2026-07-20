import { createContext, useContext, type ReactNode } from 'react'
import { useMessagesDataSource, type MessagesDataSource } from './useMessagesDataSource'

const MessagesContext = createContext<MessagesDataSource | null>(null)
const ActiveConversationContext = createContext<string | null | undefined>(undefined)

interface ProviderProps {
  familyId: string
  currentMemberId: string
  children: ReactNode
}

export function MessagesProvider({ familyId, currentMemberId, children }: ProviderProps) {
  const value = useMessagesDataSource({ familyId, currentMemberId })
  return (
    <ActiveConversationContext.Provider value={value.activeConversationId}>
      <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
    </ActiveConversationContext.Provider>
  )
}

export function useMessagesData(): MessagesDataSource {
  const ctx = useContext(MessagesContext)
  if (!ctx) throw new Error('useMessagesData must be used within a MessagesProvider')
  return ctx
}

export function useActiveConversationId() {
  const activeConversationId = useContext(ActiveConversationContext)
  if (activeConversationId === undefined) throw new Error('useActiveConversationId must be used within a MessagesProvider')
  return activeConversationId
}

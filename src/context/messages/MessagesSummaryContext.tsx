import { createContext, useContext, type ReactNode } from 'react'
import {
  useMessagesSummarySource,
  type MessagesSummary,
  type MessagesSummaryActions,
} from './useMessagesSummarySource'

// Four contexts, not one, so a consumer subscribes to exactly what it reads:
//
//  - the bell wants a number,
//  - the shell wants the active conversation id for the push bridge,
//  - the share dialogs want write actions (stable identity → never re-render),
//  - only the Messages list wants the conversation views.
//
// A new message therefore re-renders the shell only when the *unread number*
// or the *active conversation* actually changes.
const MessagesSummaryContext = createContext<MessagesSummary | null>(null)
const MessagesActionsContext = createContext<MessagesSummaryActions | null>(null)
const ActiveConversationContext = createContext<string | null | undefined>(undefined)
const TotalUnreadContext = createContext<number | null>(null)

interface ProviderProps {
  familyId: string
  currentMemberId: string
  children: ReactNode
}

export function MessagesSummaryProvider({ familyId, currentMemberId, children }: ProviderProps) {
  const { summary, actions, activeConversationId, totalUnreadCount } = useMessagesSummarySource({
    familyId,
    currentMemberId,
  })
  return (
    <MessagesActionsContext.Provider value={actions}>
      <ActiveConversationContext.Provider value={activeConversationId}>
        <TotalUnreadContext.Provider value={totalUnreadCount}>
          <MessagesSummaryContext.Provider value={summary}>{children}</MessagesSummaryContext.Provider>
        </TotalUnreadContext.Provider>
      </ActiveConversationContext.Provider>
    </MessagesActionsContext.Provider>
  )
}

export function useMessagesSummary(): MessagesSummary {
  const ctx = useContext(MessagesSummaryContext)
  if (!ctx) throw new Error('useMessagesSummary must be used within a MessagesSummaryProvider')
  return ctx
}

export function useMessagesActions(): MessagesSummaryActions {
  const ctx = useContext(MessagesActionsContext)
  if (!ctx) throw new Error('useMessagesActions must be used within a MessagesSummaryProvider')
  return ctx
}

export function useActiveConversationId() {
  const activeConversationId = useContext(ActiveConversationContext)
  if (activeConversationId === undefined) throw new Error('useActiveConversationId must be used within a MessagesSummaryProvider')
  return activeConversationId
}

export function useTotalUnreadCount(): number {
  const total = useContext(TotalUnreadContext)
  if (total === null) throw new Error('useTotalUnreadCount must be used within a MessagesSummaryProvider')
  return total
}

import { createContext, useContext, type ReactNode } from 'react'
import { useFamilyCore } from '../family/FamilyCoreContext'
import { useMessagesActions } from './MessagesSummaryContext'
import { useMessagesContentSource, type MessagesContentSource } from './useMessagesContentSource'

const MessagesContentContext = createContext<MessagesContentSource | null>(null)

// Mounted by the Messages route only. Everything heavy about chat — message
// pages, reactions, attachments, signed URLs, entity cards — lives and dies
// with this provider, so none of it is startup work and none of it survives
// as an unbounded cache after the user leaves. The unread summary and the
// active-conversation signal are deliberately NOT here: they stay global.
export function MessagesContentProvider({ children }: { children: ReactNode }) {
  const { familyId, currentMember } = useFamilyCore()
  const actions = useMessagesActions()
  const value = useMessagesContentSource({
    familyId,
    currentMemberId: currentMember.id,
    actions,
  })
  return <MessagesContentContext.Provider value={value}>{children}</MessagesContentContext.Provider>
}

export function useMessagesContent(): MessagesContentSource {
  const ctx = useContext(MessagesContentContext)
  if (!ctx) throw new Error('useMessagesContent must be used within a MessagesContentProvider')
  return ctx
}

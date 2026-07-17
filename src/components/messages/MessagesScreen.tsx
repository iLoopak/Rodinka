import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../strings'
import { useMessagesData } from '../../context/messages/MessagesContext'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useRouter } from '../../router'
import { ScreenHeader } from '../ui/ScreenHeader'
import { MemberAvatar } from '../ui/MemberAvatar'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import type { ConversationView } from '../../context/messages/types'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import type { MessageRow } from '../../context/messages/types'
import {
  clusterMessages,
  formatConversationTimestamp,
  formatDayDivider,
  formatMessageTime,
  messageDayKey,
} from '../../utils/messaging'

const CONVERSATION_QUERY_KEY = 'c'

export function MessagesScreen() {
  const { currentMember } = useFamilyCore()
  const { members, memberById, memberName } = useFamilyMembersData()
  const messagesData = useMessagesData()
  const {
    loading,
    error,
    conversationViews,
    groupConversation,
    directConversationsByMember,
    activeConversationId,
    setActiveConversationId,
    ensureGroupConversation,
    ensureDirectConversation,
    getMessages,
    isConversationLoaded,
    isOlderExhausted,
    loadInitialMessages,
    loadOlderMessages,
    markConversationRead,
    sendMessage,
    refresh,
  } = messagesData
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const [openingDirect, setOpeningDirect] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const requestedConversation = searchParams.get(CONVERSATION_QUERY_KEY)

  // Sync the deep-link `?c=<id>` with the active conversation. This makes
  // the browser back button jump list ↔ detail on mobile without any
  // extra state.
  useEffect(() => {
    if (requestedConversation) {
      if (activeConversationId !== requestedConversation) {
        setActiveConversationId(requestedConversation)
      }
    } else if (activeConversationId !== null) {
      setActiveConversationId(null)
    }
  }, [requestedConversation, activeConversationId, setActiveConversationId])

  const openConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId)
    setQueryParam(CONVERSATION_QUERY_KEY, conversationId, 'push')
  }, [setActiveConversationId, setQueryParam])

  const closeConversation = useCallback(() => {
    setActiveConversationId(null)
    removeQueryParam(CONVERSATION_QUERY_KEY, 'push')
  }, [setActiveConversationId, removeQueryParam])

  const openGroupConversation = useCallback(async () => {
    try {
      const id = groupConversation?.id ?? (await ensureGroupConversation())
      openConversation(id)
    } catch (e) {
      console.error('Failed to open family conversation:', e)
    }
  }, [groupConversation, ensureGroupConversation, openConversation])

  const openDirectWithMember = useCallback(async (memberId: string) => {
    setOpeningDirect(memberId)
    try {
      const existing = directConversationsByMember.get(memberId)
      const id = existing?.id ?? (await ensureDirectConversation({ id: memberId, memberId }))
      openConversation(id)
      setPickerOpen(false)
    } catch (e) {
      console.error('Failed to open direct conversation:', e)
    } finally {
      setOpeningDirect(null)
    }
  }, [directConversationsByMember, ensureDirectConversation, openConversation])

  const eligibleDirectPartners = useMemo<FamilyMember[]>(
    () => members.filter((m) => m.id !== currentMember.id),
    [members, currentMember]
  )

  const sortedConversations = useMemo(() => {
    const clone = [...conversationViews]
    clone.sort((a, b) => {
      // Family group first, then most-recent activity.
      if (a.kind === 'group' && b.kind !== 'group') return -1
      if (b.kind === 'group' && a.kind !== 'group') return 1
      const at = a.lastMessageAt ?? ''
      const bt = b.lastMessageAt ?? ''
      if (at === bt) return a.id < b.id ? -1 : 1
      return at < bt ? 1 : -1
    })
    return clone
  }, [conversationViews])

  const activeConversation = activeConversationId
    ? conversationViews.find((c) => c.id === activeConversationId) ?? null
    : null

  return (
    <div className="messages-screen" data-active={activeConversation ? 'detail' : 'list'}>
      <div className={`messages-pane messages-pane-list${activeConversation ? ' is-collapsed-mobile' : ''}`}>
        <ScreenHeader
          title={t.messages.title}
          subtitle={t.messages.subtitle}
          actions={
            <button
              type="button"
              className="btn-secondary messages-new-button"
              onClick={() => setPickerOpen(true)}
              disabled={eligibleDirectPartners.length === 0}
            >
              {t.messages.newDirect}
            </button>
          }
        />
        <MessagesList
          loading={loading}
          error={error}
          conversations={sortedConversations}
          currentMember={currentMember}
          memberById={memberById}
          memberName={memberName}
          onOpenGroup={openGroupConversation}
          onOpenConversation={openConversation}
          onRetry={refresh}
        />
      </div>

      {activeConversation && (
        <div className="messages-pane messages-pane-detail">
          <ConversationDetail
            conversation={activeConversation}
            currentMember={currentMember}
            memberById={memberById}
            memberName={memberName}
            messages={getMessages(activeConversation.id)}
            loaded={isConversationLoaded(activeConversation.id)}
            olderExhausted={isOlderExhausted(activeConversation.id)}
            loadInitial={() => loadInitialMessages(activeConversation.id)}
            loadOlder={() => loadOlderMessages(activeConversation.id)}
            onSend={(body) => sendMessage(activeConversation.id, body)}
            onMarkRead={() => markConversationRead(activeConversation.id)}
            onBack={closeConversation}
          />
        </div>
      )}

      {pickerOpen && (
        <DirectConversationPicker
          members={eligibleDirectPartners}
          openingDirect={openingDirect}
          onPick={(memberId) => void openDirectWithMember(memberId)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

interface MessagesListProps {
  loading: boolean
  error: string | null
  conversations: ConversationView[]
  currentMember: FamilyMember
  memberById: (id: string) => FamilyMember | undefined
  memberName: (id: string) => string
  onOpenGroup: () => void | Promise<void>
  onOpenConversation: (conversationId: string) => void
  onRetry: () => Promise<void>
}

function MessagesList({ loading, error, conversations, currentMember, memberById, memberName, onOpenGroup, onOpenConversation, onRetry }: MessagesListProps) {
  if (loading && conversations.length === 0) {
    return <p className="messages-loading">{t.loading.generic}</p>
  }
  if (error && conversations.length === 0) {
    return <ErrorState message={t.errors.loadFailed} onRetry={onRetry} />
  }
  if (conversations.length === 0) {
    return (
      <EmptyState
        title={t.messages.emptyTitle}
        body={t.messages.emptyBody}
        action={{ label: t.messages.startFamilyChat, onClick: () => void onOpenGroup() }}
      />
    )
  }
  return (
    <ul className="messages-conversation-list">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <button
            type="button"
            className="messages-conversation-row"
            onClick={() => onOpenConversation(conversation.id)}
          >
            <ConversationAvatar
              conversation={conversation}
              memberById={memberById}
              currentMemberId={currentMember.id}
            />
            <span className="messages-conversation-body">
              <span className="messages-conversation-title-row">
                <span className="messages-conversation-title">
                  {conversationTitle(conversation, currentMember, memberName)}
                </span>
                {conversation.lastMessageAt && (
                  <span className="messages-conversation-timestamp">
                    {formatConversationTimestamp(conversation.lastMessageAt)}
                  </span>
                )}
              </span>
              <span className="messages-conversation-preview">
                {conversation.lastMessagePreview ?? t.messages.noMessagesYet}
              </span>
            </span>
            {conversation.unreadCount > 0 && (
              <span className="messages-unread-badge" aria-label={t.messages.unreadCountAria(conversation.unreadCount)}>
                {conversation.unreadCount}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

interface ConversationDetailProps {
  conversation: ConversationView
  currentMember: FamilyMember
  memberById: (id: string) => FamilyMember | undefined
  memberName: (id: string) => string
  messages: MessageRow[]
  loaded: boolean
  olderExhausted: boolean
  loadInitial: () => void | Promise<void>
  loadOlder: () => void | Promise<void>
  onSend: (body: string) => Promise<void>
  onMarkRead: () => void | Promise<void>
  onBack: () => void
}

function ConversationDetail({
  conversation,
  currentMember,
  memberById,
  memberName,
  messages,
  loaded,
  olderExhausted,
  loadInitial,
  loadOlder,
  onSend,
  onMarkRead,
  onBack,
}: ConversationDetailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  const previousMessagesLengthRef = useRef(0)
  const conversationIdRef = useRef(conversation.id)
  const savedHeightRef = useRef<number | null>(null)

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    conversationIdRef.current = conversation.id
    stickToBottomRef.current = true
    previousMessagesLengthRef.current = 0
    // Reset scroll to bottom whenever the conversation switches.
    requestAnimationFrame(() => {
      const container = scrollRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
  }, [conversation.id])

  useEffect(() => {
    if (loaded) {
      void onMarkRead()
    }
  }, [loaded, conversation.id, onMarkRead])

  // Auto-scroll to newest when a new message lands AND we were already at
  // the bottom. If the user scrolled up to read history, we hold their
  // position (see the scroll handler below).
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const grew = messages.length > previousMessagesLengthRef.current
    previousMessagesLengthRef.current = messages.length
    if (grew && stickToBottomRef.current) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
      void onMarkRead()
    }
    if (savedHeightRef.current !== null) {
      const delta = container.scrollHeight - savedHeightRef.current
      container.scrollTop += delta
      savedHeightRef.current = null
    }
  }, [messages, onMarkRead])

  const handleScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    stickToBottomRef.current = distanceFromBottom < 96
    if (container.scrollTop < 120 && !olderExhausted) {
      savedHeightRef.current = container.scrollHeight
      void loadOlder()
    }
  }, [loadOlder, olderExhausted])

  const clusters = useMemo(() => clusterMessages(
    messages.map((m) => ({ id: m.id, senderId: m.sender_member_id, createdAt: m.created_at, message: m }))
  ), [messages])

  const dividers = useMemo(() => {
    const seen = new Set<string>()
    const dividerFor = new Map<string, string>()
    for (const message of messages) {
      const key = messageDayKey(message.created_at)
      if (!seen.has(key)) {
        seen.add(key)
        dividerFor.set(message.id, formatDayDivider(message.created_at, new Date(), { today: t.messages.today, yesterday: t.messages.yesterday }))
      }
    }
    return dividerFor
  }, [messages])

  return (
    <section className="messages-conversation" aria-labelledby="messages-conversation-title">
      <header className="messages-conversation-header">
        <button type="button" className="btn-icon messages-back-button" aria-label={t.common.close} onClick={onBack}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ConversationAvatar conversation={conversation} memberById={memberById} currentMemberId={currentMember.id} />
        <div className="messages-conversation-header-copy">
          <h2 id="messages-conversation-title">{conversationTitle(conversation, currentMember, memberName)}</h2>
          <p>{conversationSubtitle(conversation, currentMember, memberName)}</p>
        </div>
      </header>
      <div
        className="messages-thread"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {!loaded && <p className="messages-thread-loading">{t.loading.generic}</p>}
        {loaded && olderExhausted && messages.length === 0 && (
          <p className="messages-thread-empty">{t.messages.noMessagesYet}</p>
        )}
        {loaded && !olderExhausted && messages.length > 0 && (
          <button
            type="button"
            className="btn-link messages-load-older"
            onClick={() => void loadOlder()}
          >
            {t.messages.loadOlder}
          </button>
        )}
        <ol className="messages-thread-clusters">
          {clusters.map((cluster) => {
            const sender = cluster.senderId ? memberById(cluster.senderId) : null
            const mine = cluster.senderId === currentMember.id
            return (
              <li
                key={`${cluster.senderId ?? 'system'}-${cluster.messages[0].id}`}
                className={`messages-thread-cluster${mine ? ' is-mine' : ''}`}
              >
                {cluster.messages.map((entry, index) => {
                  const divider = dividers.get(entry.message.id)
                  const showHeader = index === 0 && !mine
                  return (
                    <div key={entry.message.id}>
                      {divider && (
                        <div className="messages-day-divider" role="separator">
                          <span>{divider}</span>
                        </div>
                      )}
                      {showHeader && (
                        <div className="messages-cluster-header">
                          <MemberAvatar member={sender} size={22} />
                          <span className="messages-cluster-sender">{cluster.senderId ? memberName(cluster.senderId) : t.messages.systemAuthor}</span>
                          <span className="messages-cluster-time">{formatMessageTime(entry.message.created_at)}</span>
                        </div>
                      )}
                      <div className={`messages-bubble${mine ? ' is-mine' : ''}${entry.message.id.startsWith('pending:') ? ' is-pending' : ''}`}>
                        <p className="messages-bubble-body">{entry.message.body}</p>
                        <span className="messages-bubble-time" aria-hidden="true">{formatMessageTime(entry.message.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </li>
            )
          })}
        </ol>
        <div ref={bottomAnchorRef} />
      </div>
      <Composer onSend={onSend} />
    </section>
  )
}

function ConversationAvatar({ conversation, memberById, currentMemberId }: { conversation: ConversationView; memberById: (id: string) => FamilyMember | undefined; currentMemberId: string }) {
  if (conversation.kind === 'group') {
    return (
      <span className="messages-conversation-avatar messages-avatar-group" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="3" strokeLinejoin="round" />
          <circle cx="17" cy="10.5" r="2.4" strokeLinejoin="round" />
          <path d="M3.5 19c0-2.6 2.4-4.5 5.5-4.5s5.5 1.9 5.5 4.5" strokeLinecap="round" />
          <path d="M15 15c2.6 0 4.6 1.7 4.6 4.2" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  const other = conversation.otherMemberId ? memberById(conversation.otherMemberId) : null
  if (other) return <MemberAvatar member={other} size={38} />
  const self = memberById(currentMemberId)
  return <MemberAvatar member={self} size={38} />
}

function conversationTitle(conversation: ConversationView, currentMember: FamilyMember, memberName: (id: string) => string): string {
  if (conversation.kind === 'group') return conversation.title ?? t.messages.familyGroupTitle
  if (conversation.kind === 'direct' && conversation.otherMemberId) return memberName(conversation.otherMemberId)
  return conversation.title ?? memberName(currentMember.id)
}

function conversationSubtitle(conversation: ConversationView, _currentMember: FamilyMember, memberName: (id: string) => string): string {
  if (conversation.kind === 'group') return t.messages.familyGroupSubtitle
  if (conversation.kind === 'direct' && conversation.otherMemberId) return t.messages.directSubtitle(memberName(conversation.otherMemberId))
  return ''
}

interface ComposerProps {
  onSend: (body: string) => Promise<void>
}

function Composer({ onSend }: ComposerProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const submit = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await onSend(trimmed)
      setValue('')
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      })
    } catch (e) {
      console.error('Failed to send message:', e)
    } finally {
      setSending(false)
    }
  }, [value, sending, onSend])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      void submit()
    }
  }, [submit])

  const autosize = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [])

  return (
    <form
      className="messages-composer"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label className="visually-hidden" htmlFor="messages-composer-input">{t.messages.composerLabel}</label>
      <textarea
        id="messages-composer-input"
        ref={textareaRef}
        value={value}
        rows={1}
        placeholder={t.messages.composerPlaceholder}
        onChange={(event) => {
          setValue(event.target.value)
          autosize(event.currentTarget)
        }}
        onKeyDown={handleKeyDown}
        disabled={sending}
      />
      <button
        type="submit"
        className="messages-send-button"
        disabled={sending || value.trim().length === 0}
        aria-label={t.messages.sendAria}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 12h16m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  )
}

interface DirectConversationPickerProps {
  members: FamilyMember[]
  openingDirect: string | null
  onPick: (memberId: string) => void
  onClose: () => void
}

function DirectConversationPicker({ members, openingDirect, onPick, onClose }: DirectConversationPickerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEscape)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop messages-picker-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal messages-picker"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="messages-picker-header">
          <h2>{t.messages.pickerTitle}</h2>
          <p>{t.messages.pickerBody}</p>
        </header>
        <ul className="messages-picker-list">
          {members.length === 0 && (
            <li className="messages-picker-empty">{t.messages.pickerEmpty}</li>
          )}
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="messages-picker-row"
                disabled={openingDirect === member.id}
                onClick={() => onPick(member.id)}
              >
                <MemberAvatar member={member} size={36} />
                <span>{member.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="messages-picker-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>{t.common.close}</button>
        </div>
      </div>
    </div>
  )
}

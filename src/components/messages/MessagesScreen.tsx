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
import { ConfirmDestructiveActionDialog } from '../ui/DestructiveActions'
import { memberColorStyle } from '../../utils/memberColor'
import { splitMentionText, type MentionCandidate } from '../../utils/mentions'
import { muteUntil, type MuteDuration } from '../../utils/muteDuration'
import type {
  ConversationMuteScope,
  ConversationView,
  MessageAttachmentRow,
  MessageEntityResolution,
  MessageReactionRow,
  MessageRow,
  SharedEntityType,
} from '../../context/messages/types'
import { EntityCard } from './EntityCard'
import { CreateFromMessageDialog, type CreateFromMessageKind } from './CreateFromMessageDialog'
import { ShareExistingEntityDialog, type ShareableEntityKind } from './ShareExistingEntityDialog'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import {
  clusterMessages,
  formatConversationTimestamp,
  formatDayDivider,
  formatMessageTime,
  messageDayKey,
} from '../../utils/messaging'
import { MessageContextMenu } from './MessageContextMenu'
import { ReactionsRow } from './ReactionsRow'
import { EmojiPicker, COMMON_REACTIONS } from './EmojiPicker'
import { Composer, type ComposerReplyContext } from './Composer'
import { AttachmentLightbox } from './AttachmentLightbox'
import { MobileChatPortal } from './MobileChatPortal'
import { MessagePushPrompt } from './MessagePushPrompt'
import { useMediaQuery, MOBILE_CHAT_QUERY } from '../../hooks/useMediaQuery'

const CONVERSATION_QUERY_KEY = 'c'
// Set by a push deep link so the app can scroll straight to the message the
// notification was about.
const MESSAGE_QUERY_KEY = 'm'
const LONG_PRESS_MS = 500

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
    editMessage,
    deleteMessage,
    toggleReaction,
    retryFailedMessage,
    discardFailedMessage,
    setConversationMute,
    getMessageReactions,
    getMessageAttachments,
    getAttachmentUrl,
    getMessageEntity,
    refreshMessageEntity,
    postEntitySystemMessage,
    refresh,
  } = messagesData
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const [openingDirect, setOpeningDirect] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const requestedConversation = searchParams.get(CONVERSATION_QUERY_KEY)

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

  // Stabilize the handlers that feed ConversationDetail's useEffects.
  // Inline arrows here would give the child a new reference every render;
  // when those arrows appeared in dep arrays (e.g. `[loaded, onMarkRead]`)
  // the effect refired every render, and the mark-as-read effect turned
  // into an unbounded mark_conversation_read loop that exhausted the
  // browser's connection pool and made send_message fail with
  // "TypeError: Failed to fetch". Memoizing per-conversation-id keeps
  // the child effects firing only when the conversation actually changes.
  const activeId = activeConversation?.id
  const handleLoadInitial = useCallback(
    () => (activeId ? loadInitialMessages(activeId) : Promise.resolve()),
    [activeId, loadInitialMessages],
  )
  const handleLoadOlder = useCallback(
    () => (activeId ? loadOlderMessages(activeId) : Promise.resolve()),
    [activeId, loadOlderMessages],
  )
  const handleSend = useCallback(
    (payload: Parameters<typeof sendMessage>[1]) =>
      activeId ? sendMessage(activeId, payload) : Promise.resolve(),
    [activeId, sendMessage],
  )
  const handleRetry = useCallback(
    (clientId: string) => (activeId ? retryFailedMessage(activeId, clientId) : Promise.resolve()),
    [activeId, retryFailedMessage],
  )
  const handleDiscardFailed = useCallback(
    (clientId: string) => { if (activeId) discardFailedMessage(activeId, clientId) },
    [activeId, discardFailedMessage],
  )
  const handleMarkRead = useCallback(
    () => (activeId ? markConversationRead(activeId) : Promise.resolve()),
    [activeId, markConversationRead],
  )
  const handleMuteChange = useCallback(
    (scope: ConversationMuteScope, until: string | null) =>
      activeId ? setConversationMute(activeId, scope, until) : Promise.resolve(),
    [activeId, setConversationMute],
  )

  // On mobile the detail is portaled to <body> as a true fullscreen
  // overlay; on desktop it stays inline as the second column. Building
  // the element once keeps both paths identical.
  const isMobile = useMediaQuery(MOBILE_CHAT_QUERY)
  const detail = activeConversation ? (
    <ConversationDetail
      key={activeConversation.id}
      conversation={activeConversation}
      currentMember={currentMember}
      memberById={memberById}
      memberName={memberName}
      messages={getMessages(activeConversation.id)}
      loaded={isConversationLoaded(activeConversation.id)}
      olderExhausted={isOlderExhausted(activeConversation.id)}
      loadInitial={handleLoadInitial}
      loadOlder={handleLoadOlder}
      onSend={handleSend}
      onEdit={editMessage}
      onDelete={deleteMessage}
      onReact={toggleReaction}
      onRetry={handleRetry}
      onDiscardFailed={handleDiscardFailed}
      onMarkRead={handleMarkRead}
      onBack={closeConversation}
      onMuteChange={handleMuteChange}
      getReactions={getMessageReactions}
      getAttachments={getMessageAttachments}
      getAttachmentUrl={getAttachmentUrl}
      getEntity={getMessageEntity}
      onEntityAfterAction={refreshMessageEntity}
      onEntitySystemNotice={(kind, summary, entityType, entityId) => {
        if (activeId) void postEntitySystemMessage(activeId, kind, entityType, entityId, summary)
      }}
    />
  ) : null

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

      {activeConversation && !isMobile && (
        <div className="messages-pane messages-pane-detail">{detail}</div>
      )}

      {activeConversation && isMobile && (
        <MobileChatPortal>
          <div className="messages-fullscreen">{detail}</div>
        </MobileChatPortal>
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
            {conversation.muteScope !== 'none' && (
              <span className="messages-conversation-muted" title={t.messages.mutedBadge} aria-label={t.messages.mutedBadge}>
                <MuteBellIcon />
              </span>
            )}
            {conversation.unreadCount > 0 && conversation.muteScope !== 'all' && (
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
  onSend: (payload: {
    body: string
    replyToMessageId?: string | null
    attachmentIds?: string[]
    attachments?: MessageAttachmentRow[]
    mentionMemberIds?: string[]
  }) => Promise<void>
  onEdit: (messageId: string, body: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onReact: (messageId: string, emoji: string) => Promise<void>
  onRetry: (clientId: string) => Promise<void>
  onDiscardFailed: (clientId: string) => void
  onMarkRead: () => void | Promise<void>
  onBack: () => void
  onMuteChange: (scope: ConversationMuteScope, until: string | null) => Promise<void>
  getReactions: (messageId: string) => MessageReactionRow[]
  getAttachments: (messageId: string) => MessageAttachmentRow[]
  getAttachmentUrl: (attachmentId: string) => string | null
  getEntity: (messageId: string) => MessageEntityResolution | null
  onEntityAfterAction: (messageId: string) => void
  onEntitySystemNotice: (kind: string, summary: string, entityType: SharedEntityType, entityId: string) => void
}

interface ContextMenuState {
  messageId: string
  position: { x: number; y: number }
}

interface EmojiPickerState {
  messageId: string
  position: { x: number; y: number }
}

interface LightboxState {
  url: string
  alt: string
}

function ConversationDetail(props: ConversationDetailProps) {
  const {
    conversation, currentMember, memberById, memberName, messages, loaded, olderExhausted,
    loadInitial, loadOlder, onSend, onEdit, onDelete, onReact, onRetry, onDiscardFailed,
    onMarkRead, onBack, onMuteChange, getReactions, getAttachments, getAttachmentUrl,
    getEntity, onEntityAfterAction, onEntitySystemNotice,
  } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  const previousMessagesLengthRef = useRef(0)
  const savedHeightRef = useRef<number | null>(null)
  const initialReadCursorRef = useRef<string>(conversation.lastReadAt)
  const [replyingTo, setReplyingTo] = useState<ComposerReplyContext | null>(null)
  const [editing, setEditing] = useState<{ messageId: string; body: string; error?: string | null; busy?: boolean } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [emojiPicker, setEmojiPicker] = useState<EmojiPickerState | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<{ messageId: string; busy: boolean; error: string | null } | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [muteDialogOpen, setMuteDialogOpen] = useState(false)
  const [createFrom, setCreateFrom] = useState<{ kind: CreateFromMessageKind; text: string } | null>(null)
  const [shareExisting, setShareExisting] = useState<ShareableEntityKind | null>(null)
  const [showJumpButton, setShowJumpButton] = useState(false)

  // Only real participants can be mentioned — the RPC enforces the same
  // thing server-side, so offering anyone else would just produce a
  // highlighted name that never pings.
  const mentionCandidates = useMemo<MentionCandidate[]>(
    () => conversation.memberIds
      .filter((id) => id !== currentMember.id)
      .map((id) => ({ id, name: memberName(id) }))
      .filter((candidate) => candidate.name.trim() !== ''),
    [conversation.memberIds, currentMember.id, memberName],
  )

  // The rendering list also includes the reader, so a mention of *you* can
  // be styled differently from a mention of someone else.
  const renderCandidates = useMemo<MentionCandidate[]>(
    () => conversation.memberIds
      .map((id) => ({ id, name: memberName(id) }))
      .filter((candidate) => candidate.name.trim() !== ''),
    [conversation.memberIds, memberName],
  )

  // Scroll-to-message for push deep links (`?m=<id>`). If the message is
  // older than the initially loaded page it simply is not in the DOM yet —
  // the conversation still opens at the bottom, which is the sane fallback.
  const { searchParams: detailParams, removeQueryParam: dropDetailParam } = useRouter()
  const requestedMessageId = detailParams.get(MESSAGE_QUERY_KEY)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)

  useEffect(() => {
    if (!requestedMessageId || !loaded) return
    const node = scrollRef.current?.querySelector(`[data-message-id="${CSS.escape(requestedMessageId)}"]`)
    // Consume the param either way, so a reload does not re-trigger this.
    dropDetailParam(MESSAGE_QUERY_KEY, 'replace')
    if (!node) return
    node.scrollIntoView({ block: 'center', behavior: 'smooth' })
    stickToBottomRef.current = false
    setHighlightedMessageId(requestedMessageId)
  }, [requestedMessageId, loaded, dropDetailParam])

  // Separate effect: clearing the param above re-runs the effect that set
  // the highlight, so the timer cannot live there or it would be cancelled
  // on the very next render.
  useEffect(() => {
    if (!highlightedMessageId) return
    const timer = window.setTimeout(() => setHighlightedMessageId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightedMessageId])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    initialReadCursorRef.current = conversation.lastReadAt
    stickToBottomRef.current = true
    previousMessagesLengthRef.current = 0
    setReplyingTo(null)
    setEditing(null)
    setContextMenu(null)
    setEmojiPicker(null)
    setPendingDeletion(null)
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
    setShowJumpButton(distanceFromBottom > 240)
    if (container.scrollTop < 120 && !olderExhausted) {
      savedHeightRef.current = container.scrollHeight
      void loadOlder()
    }
  }, [loadOlder, olderExhausted])

  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    stickToBottomRef.current = true
    void onMarkRead()
  }, [onMarkRead])

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

  // Find the first message whose created_at is strictly after the
  // initial read cursor for THIS session's opening — subsequent
  // realtime updates should not shove the marker down.
  const unreadDividerBefore = useMemo(() => {
    const cursor = initialReadCursorRef.current
    if (!cursor) return null
    const first = messages.find((m) => m.created_at > cursor && m.sender_member_id !== currentMember.id && !m.deleted_at)
    return first?.id ?? null
  }, [messages, currentMember.id])

  const clusters = useMemo(() => clusterMessages(
    messages.map((m) => ({ id: m.id, senderId: m.sender_member_id, createdAt: m.created_at, message: m }))
  ), [messages])

  const openContextMenu = useCallback((message: MessageRow, position: { x: number; y: number }) => {
    if (message.deleted_at) return
    if (message.id.startsWith('pending:')) return
    setContextMenu({ messageId: message.id, position })
  }, [])

  const openEmojiPicker = useCallback((message: MessageRow, position: { x: number; y: number }) => {
    if (message.deleted_at) return
    if (message.id.startsWith('pending:')) return
    setEmojiPicker({ messageId: message.id, position })
  }, [])

  const beginReply = useCallback((message: MessageRow) => {
    const author = message.sender_member_id ? memberName(message.sender_member_id) : t.messages.systemAuthor
    const preview = message.body || (message.has_attachments ? '📷' : '')
    setReplyingTo({ messageId: message.id, authorName: author, preview })
    setContextMenu(null)
  }, [memberName])

  const beginEdit = useCallback((message: MessageRow) => {
    setEditing({ messageId: message.id, body: message.body })
    setContextMenu(null)
  }, [])

  const commitEdit = useCallback(async () => {
    if (!editing) return
    const trimmed = editing.body.trim()
    if (!trimmed) return
    setEditing((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await onEdit(editing.messageId, trimmed)
      setEditing(null)
    } catch (e) {
      setEditing((current) => (current ? { ...current, busy: false, error: (e as Error).message } : current))
    }
  }, [editing, onEdit])

  const requestDelete = useCallback((message: MessageRow) => {
    setPendingDeletion({ messageId: message.id, busy: false, error: null })
    setContextMenu(null)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!pendingDeletion) return
    setPendingDeletion({ ...pendingDeletion, busy: true, error: null })
    try {
      await onDelete(pendingDeletion.messageId)
      setPendingDeletion(null)
    } catch (e) {
      setPendingDeletion((current) => (current ? { ...current, busy: false, error: (e as Error).message } : current))
    }
  }, [pendingDeletion, onDelete])

  const cancelDelete = useCallback(() => {
    setPendingDeletion(null)
  }, [])

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
        <button
          type="button"
          className={`messages-conversation-mute-button${conversation.muteScope !== 'none' ? ' is-muted' : ''}`}
          onClick={() => setMuteDialogOpen(true)}
          aria-label={conversation.muteScope === 'none' ? t.messages.muteConversation : t.messages.unmuteConversation}
          title={conversation.muteScope === 'none' ? t.messages.muteConversation : t.messages.mutedBadge}
        >
          <MuteBellIcon />
        </button>
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
                  const message = entry.message
                  const divider = dividers.get(message.id)
                  const showHeader = index === 0 && !mine
                  const isUnreadPivot = message.id === unreadDividerBefore
                  const reactions = getReactions(message.id)
                  const attachments = getAttachments(message.id)
                  const entity = getEntity(message.id)
                  const replySource = message.reply_to_message_id
                    ? messages.find((m) => m.id === message.reply_to_message_id) ?? null
                    : null
                  return (
                    <div
                      key={message.id}
                      data-message-id={message.id}
                      className={`messages-thread-item${message.id === highlightedMessageId ? ' is-push-target' : ''}`}
                    >
                      {divider && (
                        <div className="messages-day-divider" role="separator">
                          <span>{divider}</span>
                        </div>
                      )}
                      {isUnreadPivot && (
                        <div className="messages-unread-divider" role="separator">
                          <span>{t.messages.newMessagesDivider}</span>
                        </div>
                      )}
                      {message.content_type === 'system' ? (
                        <p className="messages-system-row">{message.body}</p>
                      ) : (
                      <>
                      {showHeader && sender && (
                        <div className="messages-cluster-header">
                          <MemberAvatar member={sender} size={22} />
                          <span className="messages-cluster-sender" style={memberColorStyle(sender)}>
                            {cluster.senderId ? memberName(cluster.senderId) : t.messages.systemAuthor}
                          </span>
                          <span className="messages-cluster-time">{formatMessageTime(message.created_at)}</span>
                        </div>
                      )}
                      <MessageRowView
                        message={message}
                        mine={mine}
                        sender={sender ?? undefined}
                        replySource={replySource}
                        editing={editing?.messageId === message.id ? editing : null}
                        onEditChange={(body) => setEditing((cur) => (cur ? { ...cur, body } : cur))}
                        onEditSave={() => void commitEdit()}
                        onEditCancel={() => setEditing(null)}
                        reactions={reactions}
                        attachments={attachments}
                        entity={entity}
                        conversationId={conversation.id}
                        onEntityAfterAction={onEntityAfterAction}
                        onEntitySystemNotice={onEntitySystemNotice}
                        currentMemberId={currentMember.id}
                        memberName={memberName}
                        renderCandidates={renderCandidates}
                        onOpenContextMenu={openContextMenu}
                        onOpenEmojiPicker={openEmojiPicker}
                        onQuickReaction={(emoji) => { void onReact(message.id, emoji) }}
                        onRetryFailed={() => { if (message.client_id) void onRetry(message.client_id) }}
                        onDiscardFailed={() => { if (message.client_id) onDiscardFailed(message.client_id) }}
                        onOpenLightbox={(attachment) => {
                          const url = getAttachmentUrl(attachment.id)
                          if (url) setLightbox({ url, alt: t.messages.attachmentPhotoAlt })
                        }}
                        getAttachmentUrl={getAttachmentUrl}
                      />
                      </>
                      )}
                    </div>
                  )
                })}
              </li>
            )
          })}
        </ol>
      </div>
      {showJumpButton && (
        <button
          type="button"
          className="messages-jump-latest"
          onClick={scrollToBottom}
          aria-label={t.messages.jumpToLatest}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <MessagePushPrompt
        hasReceivedMessage={messages.some((m) => m.sender_member_id && m.sender_member_id !== currentMember.id && !m.deleted_at)}
      />
      <Composer
        conversationId={conversation.id}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={async (payload) => {
          await onSend(payload)
          setReplyingTo(null)
        }}
        // The "+" menu shares something that ALREADY exists. Creating a new
        // record from chat is a different action and lives on the message
        // context menu, where it can prefill from the message text.
        onShareEntity={(kind) => setShareExisting(kind)}
        mentionCandidates={mentionCandidates}
      />
      {contextMenu && (
        <MessageContextMenu
          position={contextMenu.position}
          isMine={(() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            return target?.sender_member_id === currentMember.id
          })()}
          canEdit={(() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            return !!target && target.content_type === 'text' && !target.deleted_at
          })()}
          canDelete={(() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            return !!target && !target.deleted_at
          })()}
          onReply={() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            if (target) beginReply(target)
          }}
          onReact={() => {
            const anchor = contextMenu.position
            const target = messages.find((m) => m.id === contextMenu.messageId)
            setContextMenu(null)
            if (target) setEmojiPicker({ messageId: target.id, position: anchor })
          }}
          onEdit={() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            if (target) beginEdit(target)
          }}
          onDelete={() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            if (target) requestDelete(target)
          }}
          canCreateEntities={(() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            return Boolean(target && !target.deleted_at && target.body.trim())
          })()}
          onCreateTask={() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            setContextMenu(null)
            if (target) setCreateFrom({ kind: 'task', text: target.body.trim() })
          }}
          onCreateShopping={() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            setContextMenu(null)
            if (target) setCreateFrom({ kind: 'shopping_item', text: target.body.trim() })
          }}
          onCreateEvent={() => {
            const target = messages.find((m) => m.id === contextMenu.messageId)
            setContextMenu(null)
            if (target) setCreateFrom({ kind: 'event', text: target.body.trim() })
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
      {emojiPicker && (
        <EmojiPicker
          position={emojiPicker.position}
          onPick={(emoji) => { void onReact(emojiPicker.messageId, emoji) }}
          onClose={() => setEmojiPicker(null)}
        />
      )}
      {pendingDeletion && (
        <ConfirmDestructiveActionDialog
          open
          title={t.messages.deleteConfirmTitle}
          explanation={t.messages.deleteConfirmBody}
          confirmLabel={t.messages.deleteConfirmAction}
          busy={pendingDeletion.busy}
          error={pendingDeletion.error}
          onCancel={cancelDelete}
          onConfirm={() => void confirmDelete()}
        />
      )}
      {muteDialogOpen && (
        <MuteConversationDialog
          currentScope={conversation.muteScope}
          mutedUntil={conversation.mutedUntil}
          onSelect={async (scope, until) => {
            setMuteDialogOpen(false)
            try {
              await onMuteChange(scope, until)
            } catch (e) {
              console.error('Failed to update mute:', e)
            }
          }}
          onClose={() => setMuteDialogOpen(false)}
        />
      )}
      {lightbox && (
        <AttachmentLightbox url={lightbox.url} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
      {shareExisting && (
        <ShareExistingEntityDialog
          kind={shareExisting}
          conversationId={conversation.id}
          onClose={() => setShareExisting(null)}
        />
      )}
      {createFrom && (
        <CreateFromMessageDialog
          kind={createFrom.kind}
          sourceText={createFrom.text}
          conversationId={conversation.id}
          onClose={() => setCreateFrom(null)}
        />
      )}
    </section>
  )
}

interface MessageRowViewProps {
  message: MessageRow
  mine: boolean
  sender?: FamilyMember
  replySource: MessageRow | null
  editing: { messageId: string; body: string; error?: string | null; busy?: boolean } | null
  onEditChange: (body: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  reactions: MessageReactionRow[]
  attachments: MessageAttachmentRow[]
  entity: MessageEntityResolution | null
  conversationId: string
  onEntityAfterAction: (messageId: string) => void
  onEntitySystemNotice: (kind: string, summary: string, entityType: SharedEntityType, entityId: string) => void
  currentMemberId: string
  memberName: (id: string) => string
  /** Everyone whose "@Name" should highlight, including the reader. */
  renderCandidates: MentionCandidate[]
  onOpenContextMenu: (message: MessageRow, position: { x: number; y: number }) => void
  onOpenEmojiPicker: (message: MessageRow, position: { x: number; y: number }) => void
  onQuickReaction: (emoji: string) => void
  onRetryFailed: () => void
  onDiscardFailed: () => void
  onOpenLightbox: (attachment: MessageAttachmentRow) => void
  getAttachmentUrl: (attachmentId: string) => string | null
}

function MessageRowView({
  message, mine, sender, replySource, editing,
  onEditChange, onEditSave, onEditCancel,
  reactions, attachments, entity, conversationId, onEntityAfterAction, onEntitySystemNotice,
  currentMemberId, memberName, renderCandidates,
  onOpenContextMenu, onOpenEmojiPicker, onQuickReaction,
  onRetryFailed, onDiscardFailed, onOpenLightbox, getAttachmentUrl,
}: MessageRowViewProps) {
  const longPressTimerRef = useRef<number | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => () => clearLongPress(), [])

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onOpenContextMenu(message, { x: event.clientX, y: event.clientY })
  }

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    const anchor = { x: touch.clientX, y: touch.clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      onOpenContextMenu(message, anchor)
      if ('vibrate' in navigator) {
        try { navigator.vibrate?.(15) } catch { /* ignore */ }
      }
    }, LONG_PRESS_MS)
  }

  const handleTouchEnd = () => clearLongPress()
  const handleTouchMove = () => clearLongPress()

  const handleMenuButton = (event: React.MouseEvent) => {
    event.stopPropagation()
    const rect = bubbleRef.current?.getBoundingClientRect()
    const position = rect ? { x: rect.right - 12, y: rect.bottom } : { x: event.clientX, y: event.clientY }
    onOpenContextMenu(message, position)
  }

  const handleReactShortcut = (event: React.MouseEvent) => {
    event.stopPropagation()
    const rect = bubbleRef.current?.getBoundingClientRect()
    const position = rect ? { x: rect.left, y: rect.top - 4 } : { x: event.clientX, y: event.clientY }
    onOpenEmojiPicker(message, position)
  }

  const isEditing = editing?.messageId === message.id
  const isDeleted = !!message.deleted_at
  const isPending = message.id.startsWith('pending:') || message.deliveryStatus === 'sending'
  const failed = message.deliveryStatus === 'failed'
  const senderColor = sender ? memberColorStyle(sender) : undefined

  return (
    <div className={`messages-bubble-row${mine ? ' is-mine' : ''}`}>
      <div
        ref={bubbleRef}
        className={`messages-bubble${mine ? ' is-mine' : ''}${isPending ? ' is-pending' : ''}${failed ? ' is-failed' : ''}${isDeleted ? ' is-deleted' : ''}`}
        style={mine ? undefined : senderColor}
        onContextMenu={isDeleted || isPending ? undefined : handleContextMenu}
        onTouchStart={isDeleted || isPending ? undefined : handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchCancel={handleTouchEnd}
      >
        {replySource && !isDeleted && (
          <div className="messages-bubble-reply">
            <span className="messages-bubble-reply-author">
              {replySource.sender_member_id ? memberName(replySource.sender_member_id) : t.messages.systemAuthor}
            </span>
            <span className="messages-bubble-reply-body">
              {replySource.deleted_at ? t.messages.messageDeleted : (replySource.body || (replySource.has_attachments ? '📷' : ''))}
            </span>
          </div>
        )}
        {attachments.length > 0 && !isDeleted && (
          <ul className="messages-bubble-attachments">
            {attachments.map((attachment) => {
              const url = getAttachmentUrl(attachment.id)
              return (
                <li key={attachment.id}>
                  <button
                    type="button"
                    className="messages-bubble-attachment-button"
                    onClick={() => onOpenLightbox(attachment)}
                    aria-label={t.messages.photoOpenFullscreen}
                    disabled={!url}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={t.messages.attachmentPhotoAlt}
                        loading="lazy"
                        decoding="async"
                        className="messages-bubble-attachment-image"
                      />
                    ) : (
                      <span className="messages-bubble-attachment-placeholder">…</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {entity && !isDeleted && (
          <EntityCard
            resolution={entity}
            conversationId={conversationId}
            onAfterAction={() => onEntityAfterAction(message.id)}
            onSystemNotice={(kind, summary) => onEntitySystemNotice(kind, summary, entity.entityType, entity.entityId)}
          />
        )}
        {isDeleted ? (
          <p className="messages-bubble-body is-deleted">{t.messages.messageDeleted}</p>
        ) : isEditing ? (
          <EditInline
            body={editing!.body}
            busy={editing!.busy}
            error={editing!.error}
            onChange={onEditChange}
            onSave={onEditSave}
            onCancel={onEditCancel}
          />
        ) : (
          message.body && (
            <p className="messages-bubble-body">
              <MentionText body={message.body} candidates={renderCandidates} currentMemberId={currentMemberId} />
            </p>
          )
        )}
        <div className="messages-bubble-meta">
          {message.edited_at && !isDeleted && (
            <span className="messages-bubble-edited" title={t.messages.editingIndicator}>· {t.messages.editingIndicator}</span>
          )}
          <span className="messages-bubble-time" aria-hidden="true">{formatMessageTime(message.created_at)}</span>
          {isPending && !failed && (
            <span className="messages-bubble-status is-pending" aria-label={t.messages.sending}>
              <SpinnerIcon />
            </span>
          )}
          {failed && (
            <span className="messages-bubble-status is-failed" aria-label={t.messages.sendFailed}>!</span>
          )}
        </div>
        {!isEditing && !isDeleted && !isPending && !failed && (
          <div className="messages-bubble-actions">
            <button
              type="button"
              className="messages-bubble-action-button"
              onClick={handleReactShortcut}
              aria-label={t.messages.react}
            >
              <span aria-hidden="true">{COMMON_REACTIONS[0]}</span>
            </button>
            <button
              type="button"
              className="messages-bubble-action-button"
              onClick={handleMenuButton}
              aria-label={t.messages.messageOptionsAria}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <circle cx="6" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="18" cy="12" r="1.6" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {failed && (
        <div className="messages-bubble-failed-actions">
          <button type="button" className="btn-link" onClick={onRetryFailed}>{t.messages.retrySend}</button>
          <button type="button" className="btn-link is-quiet" onClick={onDiscardFailed}>{t.messages.discardFailed}</button>
        </div>
      )}
      <ReactionsRow
        reactions={reactions}
        currentMemberId={currentMemberId}
        onToggle={(emoji) => onQuickReaction(emoji)}
        memberName={memberName}
      />
    </div>
  )
}

// Highlights "@Name" runs using exactly the rule the server uses to decide
// who gets a mention push, so highlighted == notified.
function MentionText({ body, candidates, currentMemberId }: {
  body: string
  candidates: MentionCandidate[]
  currentMemberId: string
}) {
  const segments = useMemo(() => splitMentionText(body, candidates), [body, candidates])
  if (segments.length === 1 && !segments[0].member) return <>{body}</>
  return (
    <>
      {segments.map((segment, index) => (
        segment.member
          ? (
            <span
              key={`${index}-${segment.member.id}`}
              className={`messages-mention${segment.member.id === currentMemberId ? ' is-self' : ''}`}
            >
              {segment.text}
            </span>
          )
          : <span key={index}>{segment.text}</span>
      ))}
    </>
  )
}

function EditInline({ body, busy, error, onChange, onSave, onCancel }: {
  body: string
  busy?: boolean
  error?: string | null
  onChange: (body: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="messages-bubble-edit">
      <textarea
        value={body}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t.messages.editMessagePlaceholder}
        autoFocus
        rows={2}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); onCancel() }
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSave() }
        }}
      />
      {error && <p className="messages-bubble-edit-error" role="alert">{error}</p>}
      <div className="messages-bubble-edit-actions">
        <button type="button" className="btn-link" onClick={onCancel} disabled={busy}>{t.messages.cancelEdit}</button>
        <button type="button" className="btn-primary" onClick={onSave} disabled={busy || body.trim().length === 0}>{t.messages.saveEdit}</button>
      </div>
    </div>
  )
}

function MuteConversationDialog({ currentScope, mutedUntil, onSelect, onClose }: {
  currentScope: ConversationMuteScope
  mutedUntil: string | null
  onSelect: (scope: ConversationMuteScope, until: string | null) => void | Promise<void>
  onClose: () => void
}) {
  // Scope answers "how much", duration answers "how long". Keeping them
  // separate avoids a six-item list of every combination.
  const [scope, setScope] = useState<Exclude<ConversationMuteScope, 'none'>>(
    currentScope === 'all' ? 'all' : 'messages',
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const durations: { id: MuteDuration; label: string }[] = [
    { id: 'hour', label: t.messages.muteForHour },
    { id: 'tomorrow', label: t.messages.muteUntilTomorrow },
    { id: 'forever', label: t.messages.muteForever },
  ]

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-sheet messages-mute-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{t.messages.muteScopeTitle}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t.common.close}>×</button>
        </div>

        {currentScope !== 'none' && (
          <p className="messages-mute-current" role="status">
            {mutedUntil ? t.messages.muteActiveUntil(formatMuteUntil(mutedUntil)) : t.messages.muteActiveForever}
          </p>
        )}

        <fieldset className="messages-mute-scope">
          <legend>{t.messages.muteScopeLegend}</legend>
          {(['messages', 'all'] as const).map((option) => (
            <label key={option} className={`messages-mute-option${scope === option ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="mute-scope"
                value={option}
                checked={scope === option}
                onChange={() => setScope(option)}
              />
              <span>{option === 'messages' ? t.messages.muteScopeMessages : t.messages.muteScopeAll}</span>
            </label>
          ))}
        </fieldset>

        <div className="messages-mute-options">
          {durations.map((duration) => (
            <button
              key={duration.id}
              type="button"
              className="messages-mute-duration"
              onClick={() => void onSelect(scope, muteUntil(duration.id))}
            >
              {duration.label}
            </button>
          ))}
        </div>

        {currentScope !== 'none' && (
          <button
            type="button"
            className="btn-secondary messages-mute-unmute"
            onClick={() => void onSelect('none', null)}
          >
            {t.messages.muteScopeNone}
          </button>
        )}
      </div>
    </div>
  )
}

function formatMuteUntil(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(date)
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

function MuteBellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16Z" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="messages-spin">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  )
}

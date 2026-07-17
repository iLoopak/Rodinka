import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import type { RealtimeConnectionState } from '../../realtime/connectionState'
import type {
  ConversationMemberRow,
  ConversationRow,
  ConversationView,
  MessageRow,
} from './types'

// Cap so a very old family thread doesn't drop 20k messages into memory.
// Older history can be paged later — the initial batch is intentionally
// small because the hot path is "recent conversation, live updates".
const INITIAL_MESSAGES_LIMIT = 60
const OLDER_PAGE_SIZE = 40

interface UseMessagesDataSourceArgs {
  familyId: string | undefined
  currentMemberId: string | undefined
}

interface DirectConversationTarget {
  id: string
  memberId: string
}

// One provider owns three tables (conversations, conversation_members,
// messages) behind a single `family:<id>:messages` channel — same
// convention every other domain follows.
export function useMessagesDataSource({ familyId, currentMemberId }: UseMessagesDataSourceArgs) {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [members, setMembers] = useState<ConversationMemberRow[]>([])
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessageRow[]>>({})
  const [loadedConversations, setLoadedConversations] = useState<Set<string>>(() => new Set())
  const [olderExhausted, setOlderExhausted] = useState<Set<string>>(() => new Set())
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messagesRealtimeStatus, setMessagesRealtimeStatus] = useState<RealtimeConnectionState>('connecting')
  const activeFamilyIdRef = useRef(familyId)
  activeFamilyIdRef.current = familyId

  // ------------------------------------------------------------
  // Initial load: everything the caller can already see (RLS scopes).
  // ------------------------------------------------------------

  const refresh = useCallback(async () => {
    if (!familyId) {
      setConversations([])
      setMembers([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const groupResult = await supabase.rpc('ensure_family_group_conversation', { p_family_id: familyId })
      if (groupResult.error) throw groupResult.error

      const [{ data: convData, error: convError }, { data: memberData, error: memberError }] = await Promise.all([
        supabase
          .from('conversations')
          .select('id, family_id, kind, title, direct_key, created_by_member_id, last_message_at, last_message_preview, created_at, updated_at')
          .eq('family_id', familyId)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
        supabase
          .from('conversation_members')
          .select('conversation_id, member_id, role, joined_at, last_read_at, muted_at, archived_at'),
      ])
      if (convError) throw convError
      if (memberError) throw memberError

      setConversations((convData ?? []) as ConversationRow[])
      setMembers((memberData ?? []) as ConversationMemberRow[])
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('Failed to load messaging data:', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ------------------------------------------------------------
  // Realtime — one channel, three tables. Dedup on inserts by (id) and
  // by (conversation_id, client_id) so an optimistic echo is a no-op.
  // ------------------------------------------------------------

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:messages`,
      onStatusChange: setMessagesRealtimeStatus,
      tables: [
        {
          table: 'conversations',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            setConversations((current) => applyRealtimeInsert(current, row as unknown as ConversationRow))
          },
          onUpdate: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            setConversations((current) => applyRealtimeUpdate(current, row as unknown as ConversationRow))
          },
          onDelete: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            setConversations((current) => applyRealtimeDelete(current, row.id as string))
          },
        },
        {
          // conversation_members has a composite primary key, so the generic
          // id-based helpers don't fit — patch the array by (conversation_id, member_id).
          table: 'conversation_members',
          onInsert: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as ConversationMemberRow
            setMembers((current) =>
              current.some((m) => m.conversation_id === next.conversation_id && m.member_id === next.member_id)
                ? current
                : [...current, next]
            )
          },
          onUpdate: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as ConversationMemberRow
            setMembers((current) =>
              current.map((m) =>
                m.conversation_id === next.conversation_id && m.member_id === next.member_id ? next : m
              )
            )
          },
          onDelete: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const gone = row as unknown as ConversationMemberRow
            setMembers((current) =>
              current.filter(
                (m) => !(m.conversation_id === gone.conversation_id && m.member_id === gone.member_id)
              )
            )
          },
        },
        {
          table: 'messages',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as MessageRow
            setMessagesByConversation((current) => {
              const existing = current[next.conversation_id]
              if (!existing) return current
              // Dedup by id or client_id — optimistic insert path uses client_id
              // before the server round-trip, and the realtime echo carries the
              // same client_id back. Falling back to id covers the plain "same
              // event twice" case.
              if (existing.some((m) => m.id === next.id || (m.client_id && next.client_id && m.client_id === next.client_id))) {
                return {
                  ...current,
                  [next.conversation_id]: existing.map((m) =>
                    m.id === next.id || (m.client_id && next.client_id && m.client_id === next.client_id)
                      ? { ...m, ...next }
                      : m
                  ),
                }
              }
              return { ...current, [next.conversation_id]: [...existing, next] }
            })
          },
          onUpdate: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as MessageRow
            setMessagesByConversation((current) => {
              const existing = current[next.conversation_id]
              if (!existing) return current
              return {
                ...current,
                [next.conversation_id]: existing.map((m) => (m.id === next.id ? next : m)),
              }
            })
          },
          onDelete: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const gone = row as { id?: string; conversation_id?: string }
            if (!gone.id || !gone.conversation_id) return
            setMessagesByConversation((current) => {
              const existing = current[gone.conversation_id as string]
              if (!existing) return current
              return {
                ...current,
                [gone.conversation_id as string]: existing.filter((m) => m.id !== gone.id),
              }
            })
          },
        },
      ],
    })
    return unsubscribe
  }, [familyId])

  // ------------------------------------------------------------
  // Load messages for a conversation on demand.
  // ------------------------------------------------------------

  const loadInitialMessages = useCallback(
    async (conversationId: string) => {
      if (loadedConversations.has(conversationId)) return
      const { data, error: loadError } = await supabase
        .from('messages')
        .select('id, conversation_id, family_id, sender_member_id, content_type, body, client_id, reply_to_message_id, system_kind, edited_at, deleted_at, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(INITIAL_MESSAGES_LIMIT)
      if (loadError) {
        console.error('Failed to load messages:', loadError.message)
        return
      }
      const rows = (data ?? []) as MessageRow[]
      const ascending = [...rows].sort((a, b) => compareMessages(a, b))
      setMessagesByConversation((current) => ({ ...current, [conversationId]: ascending }))
      setLoadedConversations((current) => {
        const next = new Set(current)
        next.add(conversationId)
        return next
      })
      if (rows.length < INITIAL_MESSAGES_LIMIT) {
        setOlderExhausted((current) => {
          if (current.has(conversationId)) return current
          const next = new Set(current)
          next.add(conversationId)
          return next
        })
      }
    },
    [loadedConversations]
  )

  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      const existing = messagesByConversation[conversationId] ?? []
      if (existing.length === 0) return
      if (olderExhausted.has(conversationId)) return
      const oldest = existing[0]
      const { data, error: loadError } = await supabase
        .from('messages')
        .select('id, conversation_id, family_id, sender_member_id, content_type, body, client_id, reply_to_message_id, system_kind, edited_at, deleted_at, created_at')
        .eq('conversation_id', conversationId)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(OLDER_PAGE_SIZE)
      if (loadError) {
        console.error('Failed to load older messages:', loadError.message)
        return
      }
      const rows = (data ?? []) as MessageRow[]
      if (rows.length === 0) {
        setOlderExhausted((current) => {
          const next = new Set(current)
          next.add(conversationId)
          return next
        })
        return
      }
      const ascending = [...rows].sort((a, b) => compareMessages(a, b))
      setMessagesByConversation((current) => {
        const currentList = current[conversationId] ?? []
        const seen = new Set(currentList.map((m) => m.id))
        const merged = [...ascending.filter((m) => !seen.has(m.id)), ...currentList]
        return { ...current, [conversationId]: merged }
      })
      if (rows.length < OLDER_PAGE_SIZE) {
        setOlderExhausted((current) => {
          const next = new Set(current)
          next.add(conversationId)
          return next
        })
      }
    },
    [messagesByConversation, olderExhausted]
  )

  // ------------------------------------------------------------
  // Actions.
  // ------------------------------------------------------------

  const ensureGroupConversation = useCallback(async () => {
    if (!familyId) throw new Error('No family')
    const { data, error: rpcError } = await supabase.rpc('ensure_family_group_conversation', { p_family_id: familyId })
    if (rpcError) throw friendly(rpcError)
    return data as string
  }, [familyId])

  const ensureDirectConversation = useCallback(async ({ memberId }: DirectConversationTarget) => {
    const { data, error: rpcError } = await supabase.rpc('ensure_direct_conversation', { p_other_member_id: memberId })
    if (rpcError) throw friendly(rpcError)
    return data as string
  }, [])

  const sendMessage = useCallback(async (conversationId: string, body: string) => {
    if (!currentMemberId) throw new Error('No active member')
    const trimmed = body.trim()
    if (!trimmed) return
    const clientId = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: MessageRow = {
      id: `pending:${clientId}`,
      conversation_id: conversationId,
      family_id: familyId ?? '',
      sender_member_id: currentMemberId,
      content_type: 'text',
      body: trimmed,
      client_id: clientId,
      reply_to_message_id: null,
      system_kind: null,
      edited_at: null,
      deleted_at: null,
      created_at: now,
    }
    setMessagesByConversation((current) => {
      const existing = current[conversationId] ?? []
      return { ...current, [conversationId]: [...existing, optimistic] }
    })
    try {
      const { data, error: rpcError } = await supabase.rpc('send_message', {
        p_conversation_id: conversationId,
        p_body: trimmed,
        p_client_id: clientId,
      })
      if (rpcError) throw friendly(rpcError)
      const inserted = (Array.isArray(data) ? data[0] : data) as MessageRow | null
      if (inserted) {
        setMessagesByConversation((current) => {
          const existing = current[conversationId] ?? []
          const filtered = existing.filter((m) => m.client_id !== clientId)
          if (filtered.some((m) => m.id === inserted.id)) {
            return { ...current, [conversationId]: filtered }
          }
          const next = [...filtered, inserted].sort(compareMessages)
          return { ...current, [conversationId]: next }
        })
      }
    } catch (e) {
      // Roll back the optimistic row so the user isn't left with a ghost.
      setMessagesByConversation((current) => {
        const existing = current[conversationId] ?? []
        return { ...current, [conversationId]: existing.filter((m) => m.client_id !== clientId) }
      })
      throw e
    }
  }, [currentMemberId, familyId])

  const markConversationRead = useCallback(async (conversationId: string) => {
    if (!currentMemberId) return
    const now = new Date().toISOString()
    setMembers((current) =>
      current.map((m) =>
        m.conversation_id === conversationId && m.member_id === currentMemberId
          ? { ...m, last_read_at: now }
          : m
      )
    )
    const { error: rpcError } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_up_to: now,
    })
    if (rpcError) {
      console.error('Failed to mark conversation read:', rpcError.message)
    }
  }, [currentMemberId])

  // ------------------------------------------------------------
  // Derived views.
  // ------------------------------------------------------------

  const membersByConversation = useMemo(() => {
    const map = new Map<string, ConversationMemberRow[]>()
    for (const m of members) {
      const list = map.get(m.conversation_id)
      if (list) list.push(m)
      else map.set(m.conversation_id, [m])
    }
    return map
  }, [members])

  const conversationViews = useMemo<ConversationView[]>(() => {
    return conversations.map((c) => {
      const list = membersByConversation.get(c.id) ?? []
      const memberIds = list.map((m) => m.member_id)
      const selfRow = currentMemberId ? list.find((m) => m.member_id === currentMemberId) : undefined
      const lastReadAt = selfRow?.last_read_at ?? new Date(0).toISOString()
      const messages = messagesByConversation[c.id] ?? []
      // Fall back to conversation.last_message_at when the message list
      // for this conversation hasn't been loaded yet — the badge should
      // still reflect activity that happened before the user visited.
      let unreadCount = 0
      if (loadedConversations.has(c.id)) {
        for (const m of messages) {
          if (m.sender_member_id === currentMemberId) continue
          if (m.deleted_at) continue
          if (m.created_at > lastReadAt) unreadCount += 1
        }
      } else if (c.last_message_at && c.last_message_at > lastReadAt) {
        // At least 1 unread; we don't know the exact count until it loads.
        unreadCount = 1
      }
      const otherMemberId = c.kind === 'direct'
        ? memberIds.find((id) => id !== currentMemberId) ?? null
        : null
      return {
        id: c.id,
        kind: c.kind,
        title: c.title,
        familyId: c.family_id,
        lastMessageAt: c.last_message_at,
        lastMessagePreview: c.last_message_preview,
        memberIds,
        unreadCount,
        lastReadAt,
        otherMemberId,
      }
    })
  }, [conversations, membersByConversation, messagesByConversation, loadedConversations, currentMemberId])

  const totalUnreadCount = useMemo(
    () => conversationViews.reduce((acc, c) => acc + c.unreadCount, 0),
    [conversationViews]
  )

  const groupConversation = useMemo(
    () => conversationViews.find((c) => c.kind === 'group') ?? null,
    [conversationViews]
  )

  const directConversationsByMember = useMemo(() => {
    const map = new Map<string, ConversationView>()
    for (const c of conversationViews) {
      if (c.kind !== 'direct' || !c.otherMemberId) continue
      map.set(c.otherMemberId, c)
    }
    return map
  }, [conversationViews])

  const getMessages = useCallback(
    (conversationId: string): MessageRow[] => messagesByConversation[conversationId] ?? [],
    [messagesByConversation]
  )

  const isConversationLoaded = useCallback(
    (conversationId: string): boolean => loadedConversations.has(conversationId),
    [loadedConversations]
  )

  const isOlderExhausted = useCallback(
    (conversationId: string): boolean => olderExhausted.has(conversationId),
    [olderExhausted]
  )

  return {
    loading,
    error,
    messagesRealtimeStatus,
    conversationViews,
    groupConversation,
    directConversationsByMember,
    totalUnreadCount,
    activeConversationId,
    setActiveConversationId,
    getMessages,
    isConversationLoaded,
    isOlderExhausted,
    ensureGroupConversation,
    ensureDirectConversation,
    sendMessage,
    markConversationRead,
    loadInitialMessages,
    loadOlderMessages,
    refresh,
  }
}

function compareMessages(a: MessageRow, b: MessageRow) {
  if (a.created_at === b.created_at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  return a.created_at < b.created_at ? -1 : 1
}

export type MessagesDataSource = ReturnType<typeof useMessagesDataSource>

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import type { RealtimeConnectionState } from '../../realtime/connectionState'
import { createMessageStream, type MessageStream } from './messageStream'
import {
  addMark,
  countUnread,
  isTracked,
  markFor,
  registerMarks,
  removeMark,
  type UnreadMarks,
} from './unreadMarks'
import type {
  ConversationMemberRow,
  ConversationMuteScope,
  ConversationRow,
  ConversationView,
  MessageRow,
  SharedEntityType,
} from './types'

interface UseMessagesSummarySourceArgs {
  familyId: string | undefined
  currentMemberId: string | undefined
}

interface DirectConversationTarget {
  id: string
  memberId: string
}

export interface ShareEntityPayload {
  entityType: SharedEntityType
  entityId: string
  body?: string
  fallbackLabel?: string
  clientId?: string
}

// The globally mounted half of the messaging module (Wave 5).
//
// It owns conversation metadata, unread bookkeeping, the active-conversation
// signal the push bridge reads, and the writes that must work from any screen
// (open/ensure a conversation, share an entity into chat, mute, mark read).
//
// It deliberately does NOT own message bodies, reactions, attachments, signed
// URLs or entity cards — those live in the route-scoped content layer and are
// never fetched on Home. The single `family:<id>:messages` channel stays here
// because unread counts have to stay live everywhere; message rows are
// re-broadcast to the content layer through `messageStream`.
export function useMessagesSummarySource({ familyId, currentMemberId }: UseMessagesSummarySourceArgs) {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [members, setMembers] = useState<ConversationMemberRow[]>([])
  const [unreadMarks, setUnreadMarks] = useState<UnreadMarks>({})
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messagesRealtimeStatus, setMessagesRealtimeStatus] = useState<RealtimeConnectionState>('connecting')
  const activeFamilyIdRef = useRef(familyId)
  activeFamilyIdRef.current = familyId
  const currentMemberIdRef = useRef(currentMemberId)
  currentMemberIdRef.current = currentMemberId

  // One emitter instance per provider mount, so a family switch cannot leave
  // a stale content listener attached to the previous family's stream.
  const streamRef = useRef<MessageStream | null>(null)
  if (!streamRef.current) streamRef.current = createMessageStream()
  const stream = streamRef.current

  // ------------------------------------------------------------
  // Initial load: conversation metadata only. No message content.
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
          .select('conversation_id, member_id, role, joined_at, last_read_at, muted_at, muted_until, mute_scope, archived_at'),
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
  // Realtime — one channel, three metadata tables. Message rows are applied
  // to unread bookkeeping here and forwarded to the content layer.
  // ------------------------------------------------------------

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:messages`,
      owner: 'MessagesSummaryProvider',
      openReason: 'provider-mount',
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
            const mark = markFor(next, currentMemberIdRef.current)
            if (mark) setUnreadMarks((current) => addMark(current, next.conversation_id, mark))
            stream.emit({ type: 'insert', row: next })
          },
          onUpdate: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as MessageRow
            // A delete in this product is a soft delete (`deleted_at`), so the
            // unread badge has to drop it on UPDATE, not on DELETE.
            if (next.deleted_at) {
              setUnreadMarks((current) => removeMark(current, next.conversation_id, next.id))
            }
            stream.emit({ type: 'update', row: next })
          },
          onDelete: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const gone = row as { id?: string; conversation_id?: string }
            if (!gone.id || !gone.conversation_id) return
            setUnreadMarks((current) => removeMark(current, gone.conversation_id as string, gone.id as string))
            stream.emit({ type: 'delete', id: gone.id, conversationId: gone.conversation_id })
          },
        },
      ],
    })
    return unsubscribe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  // ------------------------------------------------------------
  // Unread bookkeeping fed by the content layer.
  // ------------------------------------------------------------

  // The content layer reports which rows a loaded page contained; the summary
  // stays the only place that decides what "unread" means. This is a one-way
  // feed of metadata, not a second store of the thread.
  const registerLoadedMessages = useCallback((conversationId: string, rows: MessageRow[]) => {
    setUnreadMarks((current) => registerMarks(current, conversationId, rows, currentMemberIdRef.current))
  }, [])

  // ------------------------------------------------------------
  // Actions available from every screen.
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

  // Share a live planner entity into a conversation from anywhere in the app
  // (Shopping, a chore modal, an activity modal). The optimistic bubble is
  // the content layer's job and only matters while the chat is on screen, so
  // this stays a plain write and returns the inserted row for that layer to
  // reconcile against.
  const shareEntity = useCallback(async (conversationId: string, payload: ShareEntityPayload) => {
    const { data, error: rpcError } = await supabase.rpc('share_entity_to_conversation', {
      p_conversation_id: conversationId,
      p_entity_type: payload.entityType,
      p_entity_id: payload.entityId,
      p_body: payload.body?.trim() ?? null,
      p_client_id: payload.clientId ?? crypto.randomUUID(),
      p_fallback_label: payload.fallbackLabel ?? null,
    })
    if (rpcError) throw friendly(rpcError)
    return (Array.isArray(data) ? data[0] : data) as MessageRow | null
  }, [])

  // `until = null` means indefinite; a timestamp means the mute lapses on
  // its own. The server caps it, so a bad clock cannot silence a
  // conversation permanently through this path.
  const setConversationMute = useCallback(async (
    conversationId: string,
    scope: ConversationMuteScope,
    until: string | null = null,
  ) => {
    if (!currentMemberId) return
    const mutedUntil = scope === 'none' ? null : until
    setMembers((current) =>
      current.map((m) =>
        m.conversation_id === conversationId && m.member_id === currentMemberId
          ? {
            ...m,
            mute_scope: scope,
            muted_at: scope === 'none' ? null : m.muted_at ?? new Date().toISOString(),
            muted_until: mutedUntil,
          }
          : m,
      ),
    )
    const { error: rpcError } = await supabase.rpc('set_conversation_mute', {
      p_conversation_id: conversationId,
      p_scope: scope,
      p_until: mutedUntil,
    })
    if (rpcError) throw friendly(rpcError)
  }, [currentMemberId])

  // Coalescing guard: any code path that calls markConversationRead in
  // a hot loop (e.g. a useEffect whose deps churn every render, which
  // is precisely how this used to catch fire — see the ConversationDetail
  // fix in MessagesScreen) will otherwise fire an unbounded stream of
  // RPCs. The browser eventually exhausts the connection pool to the
  // Supabase host and every subsequent request — including send_message
  // — starts failing with `TypeError: Failed to fetch`, which surfaces
  // in the UI as "sending messages always fails". Belt-and-braces: the
  // useEffect side is stabilized too; this ref is defence in depth so a
  // future caller can't reintroduce the loop.
  const markReadInFlightRef = useRef<Set<string>>(new Set())
  const lastMarkReadAtRef = useRef<Record<string, number>>({})

  const markConversationRead = useCallback(async (conversationId: string) => {
    if (!currentMemberId) return
    if (markReadInFlightRef.current.has(conversationId)) return
    // Coalesce bursts within 500ms — normal "user is actively reading"
    // patterns cross this threshold, so a truly new mark still lands,
    // but a runaway effect is capped at ~2 RPCs/sec instead of
    // hundreds/sec.
    const nowMs = Date.now()
    const lastAt = lastMarkReadAtRef.current[conversationId]
    if (lastAt !== undefined && nowMs - lastAt < 500) return
    lastMarkReadAtRef.current[conversationId] = nowMs
    markReadInFlightRef.current.add(conversationId)
    const now = new Date(nowMs).toISOString()
    try {
      let didAdvance = false
      setMembers((current) => {
        const target = current.find(
          (m) => m.conversation_id === conversationId && m.member_id === currentMemberId,
        )
        if (!target) return current
        // Never move the cursor backwards — protects against a
        // realtime UPDATE that arrives with an older last_read_at
        // interleaved with a local advance.
        if (target.last_read_at >= now) return current
        didAdvance = true
        return current.map((m) => (m === target ? { ...m, last_read_at: now } : m))
      })
      if (!didAdvance) return
      const { error: rpcError } = await supabase.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
        p_up_to: now,
      })
      if (rpcError) {
        console.error('Failed to mark conversation read:', rpcError.message)
      }
    } finally {
      markReadInFlightRef.current.delete(conversationId)
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
      const mutedUntil = selfRow?.muted_until ?? null
      // A lapsed timed mute reads as unmuted without needing a write: the
      // server applies the same rule when it decides whether to push.
      const storedScope: ConversationMuteScope = selfRow?.mute_scope ?? 'none'
      const muteScope: ConversationMuteScope =
        mutedUntil && Date.parse(mutedUntil) <= Date.now() ? 'none' : storedScope
      // Exact once the content layer has reported a page for this
      // conversation; "at least one" beforehand, which is all the badge
      // needs and all a metadata-only fetch can honestly claim.
      const unreadCount = isTracked(unreadMarks, c.id)
        ? countUnread(unreadMarks, c.id, lastReadAt)
        : c.last_message_at && c.last_message_at > lastReadAt ? 1 : 0
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
        muteScope,
        mutedUntil: muteScope === 'none' ? null : mutedUntil,
      }
    })
  }, [conversations, membersByConversation, unreadMarks, currentMemberId])

  const totalUnreadCount = useMemo(
    () => conversationViews.reduce((acc, c) => acc + (c.muteScope === 'all' ? 0 : c.unreadCount), 0),
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

  // Split into two memoized halves on purpose: the actions object never
  // changes identity after mount, so a consumer that only writes (the share
  // dialogs, the push bridge) never re-renders when a conversation updates.
  const actions = useMemo(() => ({
    ensureGroupConversation,
    ensureDirectConversation,
    shareEntity,
    setConversationMute,
    markConversationRead,
    registerLoadedMessages,
    setActiveConversationId,
    refresh,
    messageStream: stream,
  }), [
    ensureGroupConversation,
    ensureDirectConversation,
    shareEntity,
    setConversationMute,
    markConversationRead,
    registerLoadedMessages,
    refresh,
    stream,
  ])

  const summary = useMemo(() => ({
    loading,
    error,
    messagesRealtimeStatus,
    conversationViews,
    groupConversation,
    directConversationsByMember,
    totalUnreadCount,
  }), [
    loading,
    error,
    messagesRealtimeStatus,
    conversationViews,
    groupConversation,
    directConversationsByMember,
    totalUnreadCount,
  ])

  return { summary, actions, activeConversationId, totalUnreadCount }
}

export type MessagesSummary = ReturnType<typeof useMessagesSummarySource>['summary']
export type MessagesSummaryActions = ReturnType<typeof useMessagesSummarySource>['actions']

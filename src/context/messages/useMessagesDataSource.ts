import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import { applyRealtimeInsert } from '../../realtime/applyRealtimeInsert'
import { applyRealtimeUpdate } from '../../realtime/applyRealtimeUpdate'
import { applyRealtimeDelete } from '../../realtime/applyRealtimeDelete'
import type { RealtimeConnectionState } from '../../realtime/connectionState'
import {
  buildMessageAttachmentPath,
  compressMessageAttachment,
  messageAttachmentExtension,
  validateMessageAttachmentFile,
  type MessageAttachmentValidationError,
} from '../../utils/messageAttachment'
import type {
  ConversationMemberRow,
  ConversationMuteScope,
  ConversationRow,
  ConversationView,
  MessageAttachmentRow,
  MessageEntityResolution,
  MessageReactionRow,
  MessageRow,
  SharedEntityType,
} from './types'

// Cap so a very old family thread doesn't drop 20k messages into memory.
// Older history can be paged later — the initial batch is intentionally
// small because the hot path is "recent conversation, live updates".
const INITIAL_MESSAGES_LIMIT = 60
const OLDER_PAGE_SIZE = 40
const ATTACHMENT_SIGNED_URL_SECONDS = 60 * 60

const MESSAGE_SELECT_COLUMNS =
  'id, conversation_id, family_id, sender_member_id, content_type, body, client_id, reply_to_message_id, system_kind, edited_at, deleted_at, has_attachments, created_at'

interface UseMessagesDataSourceArgs {
  familyId: string | undefined
  currentMemberId: string | undefined
}

interface DirectConversationTarget {
  id: string
  memberId: string
}

export interface UploadAttachmentResult {
  attachment: MessageAttachmentRow
  signedUrl: string
}

// One provider owns three tables (conversations, conversation_members,
// messages) behind a single `family:<id>:messages` channel — same
// convention every other domain follows. This batch adds reactions and
// attachments alongside the base messages stream on the same channel.
export function useMessagesDataSource({ familyId, currentMemberId }: UseMessagesDataSourceArgs) {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [members, setMembers] = useState<ConversationMemberRow[]>([])
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessageRow[]>>({})
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, MessageReactionRow[]>>({})
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, MessageAttachmentRow[]>>({})
  const [attachmentSignedUrls, setAttachmentSignedUrls] = useState<Record<string, string>>({})
  // One resolved entity card per message (a message carries at most one
  // shared entity in this batch). Keyed by message id.
  const [entityByMessage, setEntityByMessage] = useState<Record<string, MessageEntityResolution>>({})
  const [loadedConversations, setLoadedConversations] = useState<Set<string>>(() => new Set())
  const [olderExhausted, setOlderExhausted] = useState<Set<string>>(() => new Set())
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messagesRealtimeStatus, setMessagesRealtimeStatus] = useState<RealtimeConnectionState>('connecting')
  const activeFamilyIdRef = useRef(familyId)
  activeFamilyIdRef.current = familyId
  const messagesByConversationRef = useRef(messagesByConversation)
  messagesByConversationRef.current = messagesByConversation
  // In-flight guard so React state batching can't let two initial loads
  // race and clobber each other (see loadInitialMessages below). Held
  // outside state on purpose — it must update synchronously with the
  // fetch call, not on the next render.
  const initialLoadInFlightRef = useRef<Set<string>>(new Set())

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
  // Realtime — one channel, five tables. Dedup on inserts by (id) and
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
            setMessagesByConversation((current) => mergeIncomingMessage(current, next))
          },
          onUpdate: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as MessageRow
            setMessagesByConversation((current) => {
              const existing = current[next.conversation_id]
              if (!existing) return current
              return {
                ...current,
                [next.conversation_id]: existing.map((m) => (m.id === next.id ? { ...m, ...next } : m)),
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
        {
          table: 'message_reactions',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as MessageReactionRow
            setReactionsByMessage((current) => {
              const existing = current[next.message_id] ?? []
              if (existing.some((r) => r.member_id === next.member_id && r.emoji === next.emoji)) {
                return current
              }
              return { ...current, [next.message_id]: [...existing, next] }
            })
          },
          onDelete: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const gone = row as unknown as MessageReactionRow
            if (!gone.message_id) return
            setReactionsByMessage((current) => {
              const existing = current[gone.message_id]
              if (!existing) return current
              return {
                ...current,
                [gone.message_id]: existing.filter(
                  (r) => !(r.member_id === gone.member_id && r.emoji === gone.emoji),
                ),
              }
            })
          },
        },
        {
          table: 'message_attachments',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as MessageAttachmentRow
            setAttachmentsByMessage((current) => {
              const existing = current[next.message_id] ?? []
              if (existing.some((a) => a.id === next.id)) return current
              return { ...current, [next.message_id]: [...existing, next] }
            })
            void ensureAttachmentSignedUrl(next)
          },
          onUpdate: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as unknown as MessageAttachmentRow
            setAttachmentsByMessage((current) => {
              const list = current[next.message_id]
              if (!list) return { ...current, [next.message_id]: [next] }
              return {
                ...current,
                [next.message_id]: list.map((a) => (a.id === next.id ? next : a)),
              }
            })
          },
          onDelete: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const gone = row as unknown as MessageAttachmentRow
            if (!gone.id) return
            setAttachmentsByMessage((current) => {
              const list = current[gone.message_id]
              if (!list) return current
              return {
                ...current,
                [gone.message_id]: list.filter((a) => a.id !== gone.id),
              }
            })
          },
        },
        {
          table: 'message_entity_refs',
          filter: `family_id=eq.${familyId}`,
          onInsert: (row) => {
            if (activeFamilyIdRef.current !== familyId) return
            const next = row as { message_id?: string }
            // A ref just landed (e.g. another member shared an entity, or
            // our own share echoed) — resolve its live state so the card
            // renders. Dedup is handled inside resolveEntitiesFor (it
            // overwrites by message id).
            if (next.message_id) void resolveEntitiesFor([next.message_id])
          },
        },
      ],
    })
    return unsubscribe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  // ------------------------------------------------------------
  // Load messages for a conversation on demand.
  // ------------------------------------------------------------

  const loadInitialMessages = useCallback(
    async (conversationId: string) => {
      if (loadedConversations.has(conversationId)) return
      // The loaded-state check above is not enough on its own — React
      // batches state updates and the useEffect that drives this call
      // in ConversationDetail re-fires on every parent render because
      // its `loadInitial` prop is an inline arrow. Without a synchronous
      // in-flight guard, two or three initial loads can be in flight for
      // the same conversation, and any of them returning AFTER a send
      // would blindly replace the message list and drop the just-sent
      // message. That is exactly the "message appears briefly then
      // disappears" symptom this fix is chasing.
      if (initialLoadInFlightRef.current.has(conversationId)) return
      initialLoadInFlightRef.current.add(conversationId)
      try {
        const { data, error: loadError } = await supabase
          .from('messages')
          .select(MESSAGE_SELECT_COLUMNS)
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
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: mergeInitialLoad(current[conversationId], ascending),
        }))
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
        await hydrateMessageExtras(rows.map((r) => r.id))
      } finally {
        initialLoadInFlightRef.current.delete(conversationId)
      }
    },
    [loadedConversations]
  )

  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      const existing = messagesByConversation[conversationId] ?? []
      if (existing.length === 0) return
      if (olderExhausted.has(conversationId)) return
      const oldest = existing.find((m) => !m.id.startsWith('pending:')) ?? existing[0]
      const { data, error: loadError } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT_COLUMNS)
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
      await hydrateMessageExtras(rows.map((r) => r.id))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messagesByConversation, olderExhausted]
  )

  const hydrateMessageExtras = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) return
    const [{ data: reactions }, { data: attachments }] = await Promise.all([
      supabase
        .from('message_reactions')
        .select('message_id, member_id, emoji, family_id, created_at')
        .in('message_id', messageIds),
      supabase
        .from('message_attachments')
        .select('id, message_id, family_id, conversation_id, storage_bucket, storage_path, mime_type, byte_size, width, height, created_at')
        .in('message_id', messageIds),
    ])
    if (reactions) {
      setReactionsByMessage((current) => {
        const next = { ...current }
        for (const id of messageIds) next[id] = []
        for (const row of reactions as MessageReactionRow[]) {
          const list = next[row.message_id] ?? []
          list.push(row)
          next[row.message_id] = list
        }
        return next
      })
    }
    if (attachments) {
      const rows = attachments as MessageAttachmentRow[]
      setAttachmentsByMessage((current) => {
        const next = { ...current }
        for (const id of messageIds) next[id] = []
        for (const row of rows) {
          const list = next[row.message_id] ?? []
          list.push(row)
          next[row.message_id] = list
        }
        return next
      })
      await Promise.all(rows.map(ensureAttachmentSignedUrl))
    }
    await resolveEntitiesFor(messageIds)
  }, [])

  // Resolve the live state of any shared entities on these messages. Safe
  // to call repeatedly — it overwrites the cached resolution so a card
  // reflects the entity's current state after an action or a refetch.
  const resolveEntitiesFor = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) return
    const { data, error: rpcError } = await supabase.rpc('resolve_message_entities', {
      p_message_ids: messageIds,
    })
    if (rpcError) {
      console.error('Failed to resolve shared entities:', rpcError.message)
      return
    }
    const rows = (data ?? []) as Array<{
      ref_id: string
      message_id: string
      entity_type: SharedEntityType
      entity_id: string
      entity_exists: boolean
      state: Record<string, unknown> | null
    }>
    if (rows.length === 0) return
    setEntityByMessage((current) => {
      const next = { ...current }
      for (const row of rows) {
        next[row.message_id] = {
          refId: row.ref_id,
          messageId: row.message_id,
          entityType: row.entity_type,
          entityId: row.entity_id,
          exists: row.entity_exists,
          state: row.state ?? {},
        }
      }
      return next
    })
  }, [])

  const ensureAttachmentSignedUrl = useCallback(async (attachment: MessageAttachmentRow) => {
    setAttachmentSignedUrls((current) => {
      if (current[attachment.id]) return current
      return current
    })
    const { data, error: signedUrlError } = await supabase.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, ATTACHMENT_SIGNED_URL_SECONDS)
    if (signedUrlError) {
      console.error('Failed to create attachment signed URL:', signedUrlError.message)
      return
    }
    setAttachmentSignedUrls((current) => ({ ...current, [attachment.id]: data.signedUrl }))
  }, [])

  // ------------------------------------------------------------
  // Attachment upload — used by the composer BEFORE calling sendMessage.
  // Returns the created attachment id which the caller passes to
  // sendMessage / editMessage. Roll-back on cancel goes through
  // discardPendingAttachment.
  // ------------------------------------------------------------

  const uploadAttachment = useCallback(async (
    conversationId: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<UploadAttachmentResult> => {
    const conversation = conversations.find((c) => c.id === conversationId)
    if (!conversation) throw new Error('Conversation not found')
    const validationError: MessageAttachmentValidationError | null = validateMessageAttachmentFile(file)
    if (validationError) throw new Error(validationError)

    const compressed = await compressMessageAttachment(file)
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')

    const extension = messageAttachmentExtension(compressed.file.type)
    const storagePath = buildMessageAttachmentPath(conversation.family_id, conversation.id, extension)
    const { error: uploadError } = await supabase.storage
      .from('message-attachments')
      .upload(storagePath, compressed.file, {
        cacheControl: '3600',
        contentType: compressed.file.type,
        upsert: false,
      })
    if (uploadError) throw friendly(uploadError)

    if (signal?.aborted) {
      // Best-effort cleanup — we already uploaded but the user cancelled
      // before we could bind the attachment to a message.
      await supabase.storage.from('message-attachments').remove([storagePath])
      throw new DOMException('Upload cancelled', 'AbortError')
    }

    const { data, error: rpcError } = await supabase.rpc('register_message_attachment', {
      p_conversation_id: conversationId,
      p_storage_path: storagePath,
      p_mime_type: compressed.file.type,
      p_byte_size: compressed.file.size,
      p_width: compressed.width || null,
      p_height: compressed.height || null,
    })
    if (rpcError) {
      await supabase.storage.from('message-attachments').remove([storagePath])
      throw friendly(rpcError)
    }
    const attachment = (Array.isArray(data) ? data[0] : data) as MessageAttachmentRow
    const { data: signed, error: signedError } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(storagePath, ATTACHMENT_SIGNED_URL_SECONDS)
    if (signedError) console.error('Failed to sign attachment URL:', signedError.message)
    const signedUrl = signed?.signedUrl ?? ''
    setAttachmentSignedUrls((current) => ({ ...current, [attachment.id]: signedUrl }))
    setAttachmentsByMessage((current) => {
      const list = current[attachment.message_id] ?? []
      if (list.some((a) => a.id === attachment.id)) return current
      return { ...current, [attachment.message_id]: [...list, attachment] }
    })
    return { attachment, signedUrl }
  }, [conversations])

  const discardPendingAttachment = useCallback(async (attachmentId: string, storagePath: string) => {
    try {
      const { error: rpcError } = await supabase.rpc('discard_pending_attachment', {
        p_attachment_id: attachmentId,
      })
      if (rpcError) console.error('Failed to discard attachment metadata:', rpcError.message)
    } finally {
      const { error: removeError } = await supabase.storage.from('message-attachments').remove([storagePath])
      if (removeError) console.error('Failed to remove pending attachment:', removeError.message)
      setAttachmentSignedUrls((current) => {
        const next = { ...current }
        delete next[attachmentId]
        return next
      })
      setAttachmentsByMessage((current) => {
        const next: typeof current = {}
        for (const [messageId, list] of Object.entries(current)) {
          const filtered = list.filter((a) => a.id !== attachmentId)
          if (filtered.length > 0) next[messageId] = filtered
        }
        return next
      })
    }
  }, [])

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

  interface SendMessagePayload {
    body: string
    replyToMessageId?: string | null
    attachmentIds?: string[]
    attachments?: MessageAttachmentRow[]
    clientId?: string
    /** Members the composer resolved from "@Name" runs in the body. */
    mentionMemberIds?: string[]
  }

  const sendMessage = useCallback(async (conversationId: string, payload: SendMessagePayload | string) => {
    if (!currentMemberId) throw new Error('No active member')
    const normalized: SendMessagePayload = typeof payload === 'string'
      ? { body: payload }
      : payload
    const trimmed = normalized.body.trim()
    const attachmentIds = normalized.attachmentIds ?? []
    if (!trimmed && attachmentIds.length === 0) return
    const clientId = normalized.clientId ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: MessageRow = {
      id: `pending:${clientId}`,
      conversation_id: conversationId,
      family_id: familyId ?? '',
      sender_member_id: currentMemberId,
      content_type: attachmentIds.length > 0 && !trimmed ? 'image' : 'text',
      body: trimmed,
      client_id: clientId,
      reply_to_message_id: normalized.replyToMessageId ?? null,
      system_kind: null,
      edited_at: null,
      deleted_at: null,
      has_attachments: attachmentIds.length > 0,
      created_at: now,
      deliveryStatus: 'sending',
    }
    setMessagesByConversation((current) => {
      const existing = current[conversationId] ?? []
      // If we're retrying a failed send, replace the previous ghost.
      const filtered = existing.filter((m) => m.client_id !== clientId)
      return { ...current, [conversationId]: [...filtered, optimistic] }
    })
    if (normalized.attachments && normalized.attachments.length > 0) {
      setAttachmentsByMessage((current) => ({
        ...current,
        [optimistic.id]: normalized.attachments!,
      }))
    }
    try {
      const { data, error: rpcError } = await supabase.rpc('send_message', {
        p_conversation_id: conversationId,
        p_body: trimmed,
        p_client_id: clientId,
        p_reply_to_message_id: normalized.replyToMessageId ?? null,
        p_attachment_ids: attachmentIds.length > 0 ? attachmentIds : null,
        // A hint, not an authority: the RPC re-resolves mentions from the
        // body and drops any id that is not an active participant.
        p_mention_member_ids: normalized.mentionMemberIds?.length ? normalized.mentionMemberIds : null,
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
          const next = [...filtered, { ...inserted, deliveryStatus: 'sent' as const }].sort(compareMessages)
          return { ...current, [conversationId]: next }
        })
        // Re-key the optimistic attachments onto the real id.
        if (normalized.attachments && normalized.attachments.length > 0) {
          setAttachmentsByMessage((current) => {
            const next = { ...current }
            delete next[optimistic.id]
            next[inserted.id] = normalized.attachments!.map((a) => ({ ...a, message_id: inserted.id }))
            return next
          })
        }
      }
    } catch (e) {
      // Keep the optimistic row but flag it as failed so the user can retry.
      setMessagesByConversation((current) => {
        const existing = current[conversationId] ?? []
        return {
          ...current,
          [conversationId]: existing.map((m) => (m.client_id === clientId ? { ...m, deliveryStatus: 'failed', deliveryError: e instanceof Error ? e.message : String(e) } : m)),
        }
      })
      throw e
    }
  }, [currentMemberId, familyId])

  const retryFailedMessage = useCallback(async (conversationId: string, clientId: string) => {
    const ghost = (messagesByConversationRef.current[conversationId] ?? []).find((m) => m.client_id === clientId)
    if (!ghost) return
    const attachments = attachmentsByMessage[ghost.id] ?? []
    await sendMessage(conversationId, {
      body: ghost.body,
      replyToMessageId: ghost.reply_to_message_id,
      attachmentIds: attachments.map((a) => a.id),
      attachments,
      clientId,
    })
  }, [sendMessage, attachmentsByMessage])

  const discardFailedMessage = useCallback((conversationId: string, clientId: string) => {
    setMessagesByConversation((current) => {
      const existing = current[conversationId] ?? []
      return { ...current, [conversationId]: existing.filter((m) => m.client_id !== clientId) }
    })
  }, [])

  interface ShareEntityPayload {
    entityType: SharedEntityType
    entityId: string
    body?: string
    fallbackLabel?: string
    clientId?: string
  }

  // Share a live planner entity into a conversation. Optimistically shows
  // a "sending" entity message; the RPC creates the real message + ref and
  // we reconcile by client_id exactly like sendMessage. The card resolves
  // its state once the real id lands.
  const shareEntity = useCallback(async (conversationId: string, payload: ShareEntityPayload) => {
    if (!currentMemberId) throw new Error('No active member')
    const clientId = payload.clientId ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: MessageRow = {
      id: `pending:${clientId}`,
      conversation_id: conversationId,
      family_id: familyId ?? '',
      sender_member_id: currentMemberId,
      content_type: 'entity',
      body: payload.body?.trim() ?? '',
      client_id: clientId,
      reply_to_message_id: null,
      system_kind: null,
      edited_at: null,
      deleted_at: null,
      has_attachments: false,
      created_at: now,
      deliveryStatus: 'sending',
    }
    setMessagesByConversation((current) => {
      const existing = current[conversationId] ?? []
      const filtered = existing.filter((m) => m.client_id !== clientId)
      return { ...current, [conversationId]: [...filtered, optimistic] }
    })
    // Optimistic card from the caller-supplied label so the bubble isn't
    // empty during the round-trip.
    if (payload.fallbackLabel) {
      setEntityByMessage((current) => ({
        ...current,
        [optimistic.id]: {
          refId: `pending:${clientId}`,
          messageId: optimistic.id,
          entityType: payload.entityType,
          entityId: payload.entityId,
          exists: true,
          state: { title: payload.fallbackLabel, name: payload.fallbackLabel, pending: true },
        },
      }))
    }
    try {
      const { data, error: rpcError } = await supabase.rpc('share_entity_to_conversation', {
        p_conversation_id: conversationId,
        p_entity_type: payload.entityType,
        p_entity_id: payload.entityId,
        p_body: payload.body?.trim() ?? null,
        p_client_id: clientId,
        p_fallback_label: payload.fallbackLabel ?? null,
      })
      if (rpcError) throw friendly(rpcError)
      const inserted = (Array.isArray(data) ? data[0] : data) as MessageRow | null
      if (inserted) {
        setMessagesByConversation((current) => {
          const existing = current[conversationId] ?? []
          const filtered = existing.filter((m) => m.client_id !== clientId)
          if (filtered.some((m) => m.id === inserted.id)) return { ...current, [conversationId]: filtered }
          const next = [...filtered, { ...inserted, deliveryStatus: 'sent' as const }].sort(compareMessages)
          return { ...current, [conversationId]: next }
        })
        setEntityByMessage((current) => {
          if (!current[optimistic.id]) return current
          const next = { ...current }
          delete next[optimistic.id]
          return next
        })
        await resolveEntitiesFor([inserted.id])
      }
    } catch (e) {
      setMessagesByConversation((current) => {
        const existing = current[conversationId] ?? []
        return {
          ...current,
          [conversationId]: existing.map((m) =>
            m.client_id === clientId
              ? { ...m, deliveryStatus: 'failed', deliveryError: e instanceof Error ? e.message : String(e) }
              : m,
          ),
        }
      })
      throw e
    }
  }, [currentMemberId, familyId, resolveEntitiesFor])

  // Re-resolve a single message's card after an action that changed the
  // underlying entity (complete task, mark purchased) so the card reflects
  // the new state without a full refetch.
  const refreshMessageEntity = useCallback(async (messageId: string) => {
    await resolveEntitiesFor([messageId])
  }, [resolveEntitiesFor])

  // Post a restrained system message (fixed kinds only) after an entity
  // action taken through chat. Fire-and-forget: a failed notice must never
  // block the primary action's success.
  const postEntitySystemMessage = useCallback(async (
    conversationId: string,
    kind: string,
    entityType: SharedEntityType,
    entityId: string,
    summary: string,
  ) => {
    const { error: rpcError } = await supabase.rpc('post_entity_system_message', {
      p_conversation_id: conversationId,
      p_kind: kind,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_summary: summary,
    })
    if (rpcError) console.error('Failed to post system message:', rpcError.message)
  }, [])

  const editMessage = useCallback(async (messageId: string, body: string) => {
    const trimmed = body.trim()
    if (!trimmed) throw new Error('empty')
    // Optimistic — but let the RPC be the source of truth for edited_at.
    setMessagesByConversation((current) => {
      const next: typeof current = {}
      let touched = false
      for (const [conversationId, list] of Object.entries(current)) {
        const patched = list.map((m) => {
          if (m.id !== messageId) return m
          touched = true
          return { ...m, body: trimmed }
        })
        next[conversationId] = patched
      }
      return touched ? next : current
    })
    const { data, error: rpcError } = await supabase.rpc('edit_message', {
      p_message_id: messageId,
      p_body: trimmed,
    })
    if (rpcError) throw friendly(rpcError)
    const updated = (Array.isArray(data) ? data[0] : data) as MessageRow | null
    if (updated) {
      setMessagesByConversation((current) => {
        const list = current[updated.conversation_id]
        if (!list) return current
        return {
          ...current,
          [updated.conversation_id]: list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
        }
      })
    }
  }, [])

  const deleteMessage = useCallback(async (messageId: string) => {
    const { data, error: rpcError } = await supabase.rpc('delete_message', {
      p_message_id: messageId,
    })
    if (rpcError) throw friendly(rpcError)
    const updated = (Array.isArray(data) ? data[0] : data) as MessageRow | null
    if (updated) {
      setMessagesByConversation((current) => {
        const list = current[updated.conversation_id]
        if (!list) return current
        return {
          ...current,
          [updated.conversation_id]: list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
        }
      })
      setReactionsByMessage((current) => ({ ...current, [updated.id]: [] }))
      setAttachmentsByMessage((current) => ({ ...current, [updated.id]: [] }))
    }
  }, [])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!currentMemberId) return
    const trimmed = emoji.trim()
    if (!trimmed) return
    const existing = reactionsByMessage[messageId] ?? []
    const mine = existing.find((r) => r.member_id === currentMemberId && r.emoji === trimmed)
    if (mine) {
      setReactionsByMessage((current) => {
        const list = current[messageId] ?? []
        return { ...current, [messageId]: list.filter((r) => !(r.member_id === currentMemberId && r.emoji === trimmed)) }
      })
      const { error: rpcError } = await supabase.rpc('remove_message_reaction', {
        p_message_id: messageId,
        p_emoji: trimmed,
      })
      if (rpcError) console.error('Failed to remove reaction:', rpcError.message)
    } else {
      const optimistic: MessageReactionRow = {
        message_id: messageId,
        member_id: currentMemberId,
        emoji: trimmed,
        family_id: familyId ?? '',
        created_at: new Date().toISOString(),
      }
      setReactionsByMessage((current) => {
        const list = current[messageId] ?? []
        if (list.some((r) => r.member_id === currentMemberId && r.emoji === trimmed)) return current
        return { ...current, [messageId]: [...list, optimistic] }
      })
      const { error: rpcError } = await supabase.rpc('add_message_reaction', {
        p_message_id: messageId,
        p_emoji: trimmed,
      })
      if (rpcError) {
        setReactionsByMessage((current) => {
          const list = current[messageId] ?? []
          return { ...current, [messageId]: list.filter((r) => !(r.member_id === currentMemberId && r.emoji === trimmed)) }
        })
        throw friendly(rpcError)
      }
    }
  }, [reactionsByMessage, currentMemberId, familyId])

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
      const messages = messagesByConversation[c.id] ?? []
      let unreadCount = 0
      if (loadedConversations.has(c.id)) {
        for (const m of messages) {
          if (m.sender_member_id === currentMemberId) continue
          if (m.deleted_at) continue
          if (m.created_at > lastReadAt) unreadCount += 1
        }
      } else if (c.last_message_at && c.last_message_at > lastReadAt) {
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
        muteScope,
        mutedUntil: muteScope === 'none' ? null : mutedUntil,
      }
    })
  }, [conversations, membersByConversation, messagesByConversation, loadedConversations, currentMemberId])

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

  const getMessageReactions = useCallback(
    (messageId: string): MessageReactionRow[] => reactionsByMessage[messageId] ?? [],
    [reactionsByMessage],
  )

  const getMessageAttachments = useCallback(
    (messageId: string): MessageAttachmentRow[] => attachmentsByMessage[messageId] ?? [],
    [attachmentsByMessage],
  )

  const getAttachmentUrl = useCallback(
    (attachmentId: string): string | null => attachmentSignedUrls[attachmentId] ?? null,
    [attachmentSignedUrls],
  )

  const getMessageEntity = useCallback(
    (messageId: string): MessageEntityResolution | null => entityByMessage[messageId] ?? null,
    [entityByMessage],
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
    retryFailedMessage,
    discardFailedMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    setConversationMute,
    uploadAttachment,
    discardPendingAttachment,
    getMessageReactions,
    getMessageAttachments,
    getAttachmentUrl,
    getMessageEntity,
    shareEntity,
    refreshMessageEntity,
    postEntitySystemMessage,
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

export function mergeIncomingMessage(current: Record<string, MessageRow[]>, next: MessageRow): Record<string, MessageRow[]> {
  // `existing === undefined` used to short-circuit here and drop the
  // realtime insert, on the assumption that "conversation not loaded →
  // caller has no view to update". That's wrong: initial load can be
  // in flight when the insert arrives, and its snapshot was taken
  // BEFORE this row landed, so returning early would lose the message
  // until the next full refresh. Treat missing as empty so the row is
  // captured and the pending initial-load merge picks it up.
  const existing = current[next.conversation_id] ?? []
  // Dedup by id or client_id — optimistic insert path uses client_id
  // before the server round-trip, and the realtime echo carries the
  // same client_id back. Falling back to id covers the plain "same
  // event twice" case.
  if (existing.some((m) => m.id === next.id || (m.client_id && next.client_id && m.client_id === next.client_id))) {
    return {
      ...current,
      [next.conversation_id]: existing.map((m) =>
        m.id === next.id || (m.client_id && next.client_id && m.client_id === next.client_id)
          ? { ...m, ...next, deliveryStatus: 'sent' as const }
          : m
      ),
    }
  }
  return { ...current, [next.conversation_id]: [...existing, next] }
}

// Fold the initial page of server rows into whatever the client already
// has locally. Blindly replacing (the previous behaviour) drops
// optimistic sends and any realtime rows that landed while the load
// was in flight — that's the source of the "message appears briefly
// then disappears" bug.
export function mergeInitialLoad(existing: MessageRow[] | undefined, serverRows: MessageRow[]): MessageRow[] {
  if (!existing || existing.length === 0) return serverRows
  const serverIds = new Set(serverRows.map((m) => m.id))
  const serverClientIds = new Set(
    serverRows.map((m) => m.client_id).filter((cid): cid is string => Boolean(cid)),
  )
  const preserved: MessageRow[] = []
  for (const m of existing) {
    // Server row wins for anything the server already knows about.
    if (serverIds.has(m.id)) continue
    if (m.client_id && serverClientIds.has(m.client_id)) continue
    // Keep everything else: pending optimistic sends, failed sends the
    // user hasn't retried, and real rows that arrived via realtime
    // while this load was in flight.
    preserved.push(m)
  }
  if (preserved.length === 0) return serverRows
  return [...serverRows, ...preserved].sort(compareMessages)
}

export type MessagesDataSource = ReturnType<typeof useMessagesDataSource>

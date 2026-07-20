import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { friendly } from '../../utils/friendlyError'
import { createRealtimeSubscription } from '../../realtime/createRealtimeSubscription'
import {
  buildMessageAttachmentPath,
  compressMessageAttachment,
  messageAttachmentExtension,
  validateMessageAttachmentFile,
  type MessageAttachmentValidationError,
} from '../../utils/messageAttachment'
import { compareMessages, mergeIncomingMessage, mergeInitialLoad } from './messageMerge'
import type { MessagesSummaryActions, ShareEntityPayload } from './useMessagesSummarySource'
import type {
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

interface UseMessagesContentSourceArgs {
  familyId: string | undefined
  currentMemberId: string | undefined
  actions: MessagesSummaryActions
}

export interface UploadAttachmentResult {
  attachment: MessageAttachmentRow
  signedUrl: string
}

// The route-scoped half of the messaging module (Wave 5).
//
// Mounted by the Messages route only, so message pages, reactions,
// attachments, signed URLs and entity cards are never startup work. It owns
// one channel for the three content-only tables; message rows themselves
// arrive through the summary layer's stream so the `messages` table keeps a
// single subscription owner.
export function useMessagesContentSource({ familyId, currentMemberId, actions }: UseMessagesContentSourceArgs) {
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessageRow[]>>({})
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, MessageReactionRow[]>>({})
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, MessageAttachmentRow[]>>({})
  const [attachmentSignedUrls, setAttachmentSignedUrls] = useState<Record<string, string>>({})
  // One resolved entity card per message (a message carries at most one
  // shared entity in this batch). Keyed by message id.
  const [entityByMessage, setEntityByMessage] = useState<Record<string, MessageEntityResolution>>({})
  const [loadedConversations, setLoadedConversations] = useState<Set<string>>(() => new Set())
  const [olderExhausted, setOlderExhausted] = useState<Set<string>>(() => new Set())
  const activeFamilyIdRef = useRef(familyId)
  activeFamilyIdRef.current = familyId
  const messagesByConversationRef = useRef(messagesByConversation)
  messagesByConversationRef.current = messagesByConversation
  // In-flight guard so React state batching can't let two initial loads
  // race and clobber each other (see loadInitialMessages below). Held
  // outside state on purpose — it must update synchronously with the
  // fetch call, not on the next render.
  const initialLoadInFlightRef = useRef<Set<string>>(new Set())
  const { registerLoadedMessages, messageStream, shareEntity: shareEntityWrite } = actions

  // ------------------------------------------------------------
  // Entity / extra resolution.
  // ------------------------------------------------------------

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
    const { data, error: signedUrlError } = await supabase.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, ATTACHMENT_SIGNED_URL_SECONDS)
    if (signedUrlError) {
      console.error('Failed to create attachment signed URL:', signedUrlError.message)
      return
    }
    setAttachmentSignedUrls((current) => ({ ...current, [attachment.id]: data.signedUrl }))
  }, [])

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
  }, [ensureAttachmentSignedUrl, resolveEntitiesFor])

  // ------------------------------------------------------------
  // Realtime — content-only tables. `messages` is owned by the summary
  // layer and reaches this store through its stream (see below), so no
  // event is ever applied twice and no table has two subscribers.
  // ------------------------------------------------------------

  useEffect(() => {
    if (!familyId) return
    const unsubscribe = createRealtimeSubscription({
      channelName: `family:${familyId}:messages-content`,
      owner: 'MessagesContentProvider',
      openReason: 'messages-route-mount',
      tables: [
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
  }, [familyId, ensureAttachmentSignedUrl, resolveEntitiesFor])

  // Message rows forwarded from the single `messages` subscription.
  useEffect(() => {
    return messageStream.subscribe((event) => {
      if (event.type === 'insert') {
        setMessagesByConversation((current) => mergeIncomingMessage(current, event.row))
        return
      }
      if (event.type === 'update') {
        const next = event.row
        setMessagesByConversation((current) => {
          const existing = current[next.conversation_id]
          if (!existing) return current
          return {
            ...current,
            [next.conversation_id]: existing.map((m) => (m.id === next.id ? { ...m, ...next } : m)),
          }
        })
        return
      }
      setMessagesByConversation((current) => {
        const existing = current[event.conversationId]
        if (!existing) return current
        return {
          ...current,
          [event.conversationId]: existing.filter((m) => m.id !== event.id),
        }
      })
    })
  }, [messageStream])

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
        // Hand the metadata to the summary layer so its badge switches from
        // "at least one" to an exact count, and keeps that precision after
        // this route unmounts.
        registerLoadedMessages(conversationId, rows)
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
    [loadedConversations, registerLoadedMessages, hydrateMessageExtras]
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
        .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
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
      registerLoadedMessages(conversationId, rows)
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
    [messagesByConversation, olderExhausted, registerLoadedMessages, hydrateMessageExtras]
  )

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
    if (!familyId) throw new Error('No family')
    const validationError: MessageAttachmentValidationError | null = validateMessageAttachmentFile(file)
    if (validationError) throw new Error(validationError)

    const compressed = await compressMessageAttachment(file)
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')

    const extension = messageAttachmentExtension(compressed.file.type)
    const storagePath = buildMessageAttachmentPath(familyId, conversationId, extension)
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
  }, [familyId])

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
  // Message actions.
  // ------------------------------------------------------------

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

  // Share a live planner entity into the open conversation. Same write the
  // rest of the app uses (owned by the summary layer); this wrapper adds the
  // optimistic bubble that only makes sense when the thread is on screen.
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
      const inserted = await shareEntityWrite(conversationId, { ...payload, clientId })
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
  }, [currentMemberId, familyId, shareEntityWrite, resolveEntitiesFor])

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
      // The badge must lose a message the moment it is deleted, even though
      // the row itself only gets a `deleted_at` stamp.
      registerLoadedMessages(updated.conversation_id, [updated])
      setReactionsByMessage((current) => ({ ...current, [updated.id]: [] }))
      setAttachmentsByMessage((current) => ({ ...current, [updated.id]: [] }))
    }
  }, [registerLoadedMessages])

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

  // ------------------------------------------------------------
  // Readers.
  // ------------------------------------------------------------

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
    getMessages,
    isConversationLoaded,
    isOlderExhausted,
    loadInitialMessages,
    loadOlderMessages,
    sendMessage,
    retryFailedMessage,
    discardFailedMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    uploadAttachment,
    discardPendingAttachment,
    getMessageReactions,
    getMessageAttachments,
    getAttachmentUrl,
    getMessageEntity,
    shareEntity,
    refreshMessageEntity,
    postEntitySystemMessage,
  }
}

export type MessagesContentSource = ReturnType<typeof useMessagesContentSource>

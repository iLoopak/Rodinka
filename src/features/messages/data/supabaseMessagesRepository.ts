import { supabase } from '../../../supabaseClient'
import {
  buildMessageAttachmentPath,
  compressMessageAttachment,
  messageAttachmentExtension,
  validateMessageAttachmentFile,
} from '../../../utils/messageAttachment'
import type {
  MessageAttachmentRow,
  MessageEntityResolution,
  MessageReactionRow,
  SharedEntityType,
} from '../../../context/messages/types'
import { toMessagesError, type MessagesOperation } from '../domain/messageErrors'
import {
  MESSAGE_ATTACHMENT_COLUMNS,
  MESSAGE_COLUMNS,
  MESSAGE_REACTION_COLUMNS,
  mapAttachment,
  mapMessage,
  mapReaction,
} from '../domain/messageMappers'
import { SupabaseMessageAttachmentStorage, type MessageAttachmentStorage } from './messageAttachmentStorage'
import type { MessagePageQuery, MessagesRepository, SendMessageInput } from './messagesRepository'

type Row = Record<string, unknown>

async function run<T>(operation: MessagesOperation, work: () => PromiseLike<{ data: unknown; error: unknown }>, map: (data: unknown) => T): Promise<T> {
  let result: { data: unknown; error: unknown }
  try {
    result = await work()
  } catch (error) {
    throw toMessagesError(operation, error)
  }
  if (result.error) throw toMessagesError(operation, result.error)
  return map(result.data)
}

const rows = (data: unknown): Row[] => Array.isArray(data) ? (data as Row[]) : []

export class SupabaseMessagesRepository implements MessagesRepository {
  private readonly storage: MessageAttachmentStorage

  constructor(storage: MessageAttachmentStorage = new SupabaseMessageAttachmentStorage()) {
    this.storage = storage
  }

  async listPage(query: MessagePageQuery) {
    let request = supabase.from('messages').select(MESSAGE_COLUMNS)
      .eq('conversation_id', query.conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(query.limit)
    if (query.before) {
      // Keyset on (created_at, id). Offset paging would shift rows under the
      // reader every time a new message arrives, which in a live chat is
      // constantly.
      request = request.or(
        `created_at.lt.${query.before.createdAt},and(created_at.eq.${query.before.createdAt},id.lt.${query.before.id})`,
      )
    }
    return run('messages.listPage', () => request, (data) => rows(data).map(mapMessage))
  }

  async listReactions(messageIds: string[]) {
    if (messageIds.length === 0) return []
    return run('messages.hydrate',
      () => supabase.from('message_reactions').select(MESSAGE_REACTION_COLUMNS).in('message_id', messageIds),
      (data) => rows(data).map(mapReaction) as MessageReactionRow[])
  }

  async listAttachments(messageIds: string[]) {
    if (messageIds.length === 0) return []
    return run('messages.hydrate',
      () => supabase.from('message_attachments').select(MESSAGE_ATTACHMENT_COLUMNS).in('message_id', messageIds),
      (data) => rows(data).map(mapAttachment) as MessageAttachmentRow[])
  }

  async resolveEntities(messageIds: string[]) {
    if (messageIds.length === 0) return {}
    return run('messages.resolveEntities',
      () => supabase.rpc('resolve_message_entities', { p_message_ids: messageIds }),
      (data) => {
        const resolved: Record<string, MessageEntityResolution> = {}
        for (const row of rows(data)) {
          resolved[String(row.message_id)] = {
            messageId: String(row.message_id),
            refId: String(row.ref_id),
            entityType: row.entity_type as SharedEntityType,
            entityId: String(row.entity_id),
            exists: row.entity_exists === true,
            state: (row.state ?? null) as MessageEntityResolution['state'],
          }
        }
        return resolved
      })
  }

  async send(input: SendMessageInput) {
    return run('messages.send',
      () => supabase.rpc('send_message', {
        p_conversation_id: input.conversationId,
        p_body: input.body,
        // The idempotency key. Reused verbatim on retry so the server can
        // recognise the second attempt as the same message.
        p_client_id: input.clientId,
        p_reply_to_message_id: input.replyToMessageId ?? null,
        p_attachment_ids: input.attachmentIds?.length ? input.attachmentIds : null,
        p_mention_member_ids: input.mentionMemberIds?.length ? input.mentionMemberIds : null,
      }),
      (data) => {
        const row = Array.isArray(data) ? data[0] : data
        return row ? mapMessage(row as Row) : null
      })
  }

  async edit(messageId: string, body: string) {
    return run('messages.edit',
      () => supabase.rpc('edit_message', { p_message_id: messageId, p_body: body }),
      (data) => {
        const row = Array.isArray(data) ? data[0] : data
        return row ? mapMessage(row as Row) : null
      })
  }

  async remove(messageId: string) {
    return run('messages.delete',
      () => supabase.rpc('delete_message', { p_message_id: messageId }),
      (data) => {
        const row = Array.isArray(data) ? data[0] : data
        return row ? mapMessage(row as Row) : null
      })
  }

  async addReaction(messageId: string, emoji: string) {
    await run('messages.addReaction',
      () => supabase.rpc('add_message_reaction', { p_message_id: messageId, p_emoji: emoji }),
      () => undefined)
  }

  async removeReaction(messageId: string, emoji: string) {
    await run('messages.removeReaction',
      () => supabase.rpc('remove_message_reaction', { p_message_id: messageId, p_emoji: emoji }),
      () => undefined)
  }

  /**
   * Upload then register, with the object cleaned up on every path that ends
   * with it unreferenced. The two steps cannot be one transaction — the object
   * store and the database are different systems — so the window between them
   * is closed by unwinding rather than by atomicity.
   */
  async uploadAttachment(input: { conversationId: string; familyId: string; file: File; signal?: AbortSignal }) {
    const validationError = validateMessageAttachmentFile(input.file)
    if (validationError) throw toMessagesError('messages.uploadAttachment', new Error(validationError))

    const compressed = await compressMessageAttachment(input.file)
    if (input.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')

    const storagePath = buildMessageAttachmentPath(
      input.familyId,
      input.conversationId,
      messageAttachmentExtension(compressed.file.type),
    )
    await this.storage.upload(storagePath, compressed.file)

    // Cancelled after the object landed but before anything references it.
    if (input.signal?.aborted) {
      await this.storage.remove(storagePath)
      throw new DOMException('Upload cancelled', 'AbortError')
    }

    let attachment: MessageAttachmentRow
    try {
      attachment = await run('messages.registerAttachment',
        () => supabase.rpc('register_message_attachment', {
          p_conversation_id: input.conversationId,
          p_storage_path: storagePath,
          p_mime_type: compressed.file.type,
          p_byte_size: compressed.file.size,
          p_width: compressed.width || null,
          p_height: compressed.height || null,
        }),
        (data) => mapAttachment((Array.isArray(data) ? data[0] : data) as Row))
    } catch (error) {
      await this.storage.remove(storagePath)
      throw error
    }

    return { attachment, signedUrl: (await this.storage.sign(storagePath)) ?? '' }
  }

  async discardPendingAttachment(attachmentId: string, storagePath: string) {
    try {
      await run('messages.discardAttachment',
        () => supabase.rpc('discard_pending_attachment', { p_attachment_id: attachmentId }),
        () => undefined)
    } catch (error) {
      // The metadata may already be gone; the object still has to go, so this
      // is logged and the finally-equivalent below still runs.
      console.error('Failed to discard attachment metadata:', error instanceof Error ? error.message : 'unknown error')
    } finally {
      await this.storage.remove(storagePath)
    }
  }

  async signAttachment(storagePath: string) {
    return this.storage.sign(storagePath)
  }

  async postEntitySystemMessage(input: { conversationId: string; entityType: SharedEntityType; entityId: string; kind: string; summary?: string }) {
    // Fire and forget by design: a missing system notice must never fail the
    // action that prompted it.
    try {
      await run('messages.postEntitySystemMessage',
        () => supabase.rpc('post_entity_system_message', {
          p_conversation_id: input.conversationId,
          p_kind: input.kind,
          p_entity_type: input.entityType,
          p_entity_id: input.entityId,
          p_summary: input.summary ?? '',
        }),
        () => undefined)
    } catch (error) {
      console.error('Failed to post system message:', error instanceof Error ? error.message : 'unknown error')
    }
  }
}

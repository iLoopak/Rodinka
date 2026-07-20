import type {
  MessageAttachmentRow,
  MessageEntityResolution,
  MessageReactionRow,
  MessageRow,
  SharedEntityType,
} from '../../../context/messages/types'

export interface MessagesScope {
  familyId: string
}

export interface MessagePageQuery {
  conversationId: string
  limit: number
  /** Keyset anchor: the oldest row already held. */
  before?: { createdAt: string; id: string } | null
}

export interface SendMessageInput {
  conversationId: string
  body: string
  /**
   * The idempotency key. A retry MUST reuse the key of the attempt it is
   * retrying — the server deduplicates on it, so a fresh key would post the
   * same message twice.
   */
  clientId: string
  replyToMessageId?: string | null
  attachmentIds?: string[]
  /** A hint only: the RPC re-resolves mentions from the body. */
  mentionMemberIds?: string[]
}

/**
 * Messages, their reactions and their attachments.
 *
 * Split from conversations for the same reason the reminder bell was split
 * from the Reminder Center: the list of conversations and the contents of one
 * conversation have different consumers and different lifetimes.
 */
export interface MessagesRepository {
  listPage(query: MessagePageQuery): Promise<MessageRow[]>
  listReactions(messageIds: string[]): Promise<MessageReactionRow[]>
  listAttachments(messageIds: string[]): Promise<MessageAttachmentRow[]>
  resolveEntities(messageIds: string[]): Promise<Record<string, MessageEntityResolution>>

  /** Returns the inserted row so the caller can replace its optimistic one. */
  send(input: SendMessageInput): Promise<MessageRow | null>
  /** Both return the updated row: the server stamps edited_at / deleted_at. */
  edit(messageId: string, body: string): Promise<MessageRow | null>
  remove(messageId: string): Promise<MessageRow | null>
  addReaction(messageId: string, emoji: string): Promise<void>
  removeReaction(messageId: string, emoji: string): Promise<void>

  /**
   * Uploads the object and registers it, cleaning the object up if the
   * registration fails or the caller aborts in between. Returns the pending
   * attachment plus a signed URL for the composer preview.
   */
  uploadAttachment(input: {
    conversationId: string
    familyId: string
    file: File
    signal?: AbortSignal
  }): Promise<{ attachment: MessageAttachmentRow; signedUrl: string }>
  /** Drops a pending attachment: metadata first, then the object. */
  discardPendingAttachment(attachmentId: string, storagePath: string): Promise<void>
  signAttachment(storagePath: string): Promise<string | null>

  /** Fire and forget: a missing notice must not fail the action behind it. */
  postEntitySystemMessage(input: {
    conversationId: string
    entityType: SharedEntityType
    entityId: string
    kind: string
    summary?: string
  }): Promise<void>
}

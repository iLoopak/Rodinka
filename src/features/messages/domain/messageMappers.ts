import type {
  MessageAttachmentRow,
  MessageReactionRow,
  MessageRow,
} from '../../../context/messages/types'

/**
 * Column lists for the messages domain. `messages` was already defined once;
 * reactions and attachments were inline at their call sites.
 */
export const MESSAGE_COLUMNS =
  'id, conversation_id, family_id, sender_member_id, content_type, body, client_id, reply_to_message_id, system_kind, edited_at, deleted_at, has_attachments, created_at'

export const MESSAGE_REACTION_COLUMNS = 'message_id, member_id, emoji, family_id, created_at'

export const MESSAGE_ATTACHMENT_COLUMNS =
  'id, message_id, family_id, conversation_id, storage_bucket, storage_path, mime_type, byte_size, width, height, created_at'

type Row = Record<string, unknown>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const nullableText = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null
const flag = (value: unknown): boolean => value === true

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * A server message row. `deliveryStatus` is deliberately absent: it describes
 * the client's attempt to send, not anything the database knows, and letting
 * the mapper produce it would blur the two.
 *
 * The optimistic row that carries it is built by the repository's caller
 * (see `pendingMessage`), which is the only place that has a reason to.
 */
export function mapMessage(row: Row): MessageRow {
  return {
    id: text(row.id),
    conversation_id: text(row.conversation_id),
    family_id: text(row.family_id),
    sender_member_id: nullableText(row.sender_member_id),
    content_type: (row.content_type ?? 'text') as MessageRow['content_type'],
    body: text(row.body),
    client_id: nullableText(row.client_id),
    reply_to_message_id: nullableText(row.reply_to_message_id),
    system_kind: nullableText(row.system_kind) as MessageRow['system_kind'],
    edited_at: nullableText(row.edited_at),
    deleted_at: nullableText(row.deleted_at),
    has_attachments: flag(row.has_attachments),
    created_at: text(row.created_at),
  } as MessageRow
}

/** No id of its own: the key is (message_id, member_id, emoji). */
export function mapReaction(row: Row): MessageReactionRow {
  return {
    message_id: text(row.message_id),
    member_id: text(row.member_id),
    emoji: text(row.emoji),
    family_id: text(row.family_id),
    created_at: text(row.created_at),
  }
}

export function mapAttachment(row: Row): MessageAttachmentRow {
  return {
    id: text(row.id),
    // Null until the attachment is bound to a message by send/edit.
    message_id: text(row.message_id),
    family_id: text(row.family_id),
    conversation_id: text(row.conversation_id),
    storage_bucket: text(row.storage_bucket) || 'message-attachments',
    storage_path: text(row.storage_path),
    mime_type: text(row.mime_type),
    // Postgres bigint/integer can arrive as a string; a size compared as a
    // string sorts and thresholds wrongly rather than failing.
    byte_size: nullableNumber(row.byte_size) ?? 0,
    width: nullableNumber(row.width),
    height: nullableNumber(row.height),
    created_at: text(row.created_at),
  }
}

/** The id an optimistic row carries until the server answers. */
export function pendingMessageId(clientId: string) {
  return `pending:${clientId}`
}

export function isPendingMessageId(id: string) {
  return id.startsWith('pending:')
}

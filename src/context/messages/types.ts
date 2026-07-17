// Shared row shapes for the messaging module. Kept isolated from the
// hook/context files so tests and the composer UI can import types
// without pulling in Supabase-touching modules.

export type ConversationKind = 'group' | 'direct' | 'system'
export type ConversationMuteScope = 'none' | 'messages' | 'all'

export interface ConversationRow {
  id: string
  family_id: string
  kind: ConversationKind
  title: string | null
  direct_key: string | null
  created_by_member_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  created_at: string
  updated_at: string
}

export interface ConversationMemberRow {
  conversation_id: string
  member_id: string
  role: 'member' | 'owner'
  joined_at: string
  last_read_at: string
  muted_at: string | null
  muted_until: string | null
  mute_scope: ConversationMuteScope
  archived_at: string | null
}

export type MessageContentType = 'text' | 'system' | 'image'
export type MessageDeliveryStatus = 'sent' | 'sending' | 'failed'

export interface MessageRow {
  id: string
  conversation_id: string
  family_id: string
  sender_member_id: string | null
  content_type: MessageContentType
  body: string
  client_id: string | null
  reply_to_message_id: string | null
  system_kind: string | null
  edited_at: string | null
  deleted_at: string | null
  has_attachments: boolean
  created_at: string
  // Client-only. Not persisted; the server never sees these fields.
  deliveryStatus?: MessageDeliveryStatus
  deliveryError?: string | null
}

export interface MessageReactionRow {
  message_id: string
  member_id: string
  emoji: string
  family_id: string
  created_at: string
}

export interface MessageAttachmentRow {
  id: string
  message_id: string
  family_id: string
  conversation_id: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  byte_size: number
  width: number | null
  height: number | null
  created_at: string
}

// UI-shaped view of a conversation with the pieces the list and detail
// screens actually render — pre-derived so components stay dumb.
export interface ConversationView {
  id: string
  kind: ConversationKind
  title: string | null
  familyId: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  memberIds: string[]
  unreadCount: number
  lastReadAt: string
  otherMemberId: string | null
  muteScope: ConversationMuteScope
}

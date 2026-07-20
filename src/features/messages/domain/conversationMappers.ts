/**
 * Conversation-shaped pieces, split out from `messageMappers`.
 *
 * The summary layer is mounted globally, so anything it imports is startup
 * work. Keeping the message, reaction and attachment mappers out of its import
 * graph is the whole reason this file exists — the wave brief set "the eager
 * bundle does not grow" as an acceptance criterion and the split is what keeps
 * it true.
 */

export const CONVERSATION_COLUMNS =
  'id, family_id, kind, title, direct_key, created_by_member_id, last_message_at, last_message_preview, created_at, updated_at'

export const CONVERSATION_MEMBER_COLUMNS =
  'conversation_id, member_id, role, joined_at, last_read_at, muted_at, muted_until, mute_scope, archived_at'

import { supabase } from '../../../supabaseClient'
import type { ConversationMemberRow, ConversationRow, MessageRow } from '../../../context/messages/types'
import type { ShareEntityPayload } from '../../../context/messages/useMessagesSummarySource'
import { toMessagesError, type MessagesOperation } from '../domain/messageErrors'
import { CONVERSATION_COLUMNS, CONVERSATION_MEMBER_COLUMNS } from '../domain/conversationMappers'

export interface ConversationsScope {
  familyId: string
}

export interface ConversationsSnapshot {
  conversations: ConversationRow[]
  members: ConversationMemberRow[]
}

import type { ConversationMuteScope } from '../../../context/messages/types'

export type MuteScope = ConversationMuteScope

/**
 * Conversations, membership, unread bookkeeping and mute.
 *
 * Kept apart from `MessagesRepository` because the two answer different
 * questions: this one backs the conversation list and the unread badge, which
 * are global; the other backs one open thread, which is route-scoped.
 *
 * `markRead` writes `last_read_at`. It is NOT presence — `conversationPresence`
 * tells the server someone is looking at a thread right now so a push can be
 * suppressed, and that stays in `src/push` where it can be reasoned about
 * next to the notification rules.
 */
export interface ConversationsRepository {
  /** Creates the family group thread if it does not exist yet, then reads all. */
  loadSnapshot(scope: ConversationsScope): Promise<ConversationsSnapshot>
  ensureGroupConversation(scope: ConversationsScope): Promise<string>
  ensureDirectConversation(otherMemberId: string): Promise<string>
  /**
   * Posts an entity card into a thread. `clientId` is an idempotency key on
   * the same footing as the one `send_message` uses — a double-tapped share
   * must not post the card twice.
   */
  shareEntity(conversationId: string, payload: ShareEntityPayload): Promise<MessageRow | null>
  setMute(conversationId: string, scope: MuteScope, mutedUntil: string | null): Promise<void>
  markRead(conversationId: string, upTo: string): Promise<void>
}

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

export class SupabaseConversationsRepository implements ConversationsRepository {
  async loadSnapshot(scope: ConversationsScope) {
    // The group thread is created on demand, so it has to exist before the
    // list is read or the family would briefly have no conversations at all.
    await this.ensureGroupConversation(scope)

    const [conversations, members] = await Promise.all([
      run('conversations.list',
        () => supabase.from('conversations').select(CONVERSATION_COLUMNS)
          .eq('family_id', scope.familyId)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
        (data) => (Array.isArray(data) ? data : []) as ConversationRow[]),
      run('conversations.list',
        // No family filter: RLS scopes membership rows to the caller, and
        // filtering client-side on a table the user can only see their own
        // rows of would add nothing.
        () => supabase.from('conversation_members').select(CONVERSATION_MEMBER_COLUMNS),
        (data) => (Array.isArray(data) ? data : []) as ConversationMemberRow[]),
    ])
    return { conversations, members }
  }

  async ensureGroupConversation(scope: ConversationsScope) {
    return run('conversations.ensureGroup',
      () => supabase.rpc('ensure_family_group_conversation', { p_family_id: scope.familyId }),
      (data) => String(data ?? ''))
  }

  async ensureDirectConversation(otherMemberId: string) {
    return run('conversations.ensureDirect',
      () => supabase.rpc('ensure_direct_conversation', { p_other_member_id: otherMemberId }),
      (data) => String(data ?? ''))
  }

  async shareEntity(conversationId: string, payload: ShareEntityPayload) {
    return run('conversations.shareEntity',
      () => supabase.rpc('share_entity_to_conversation', {
        p_conversation_id: conversationId,
        p_entity_type: payload.entityType,
        p_entity_id: payload.entityId,
        p_body: payload.body?.trim() ?? null,
        p_client_id: payload.clientId ?? crypto.randomUUID(),
        p_fallback_label: payload.fallbackLabel ?? null,
      }),
      // Returned verbatim: the content layer owns message mapping, and
      // importing it here would put it on the startup path.
      (data) => ((Array.isArray(data) ? data[0] : data) ?? null) as MessageRow | null)
  }

  async setMute(conversationId: string, scope: MuteScope, mutedUntil: string | null) {
    await run('conversations.setMute',
      () => supabase.rpc('set_conversation_mute', {
        p_conversation_id: conversationId, p_scope: scope, p_until: mutedUntil,
      }),
      () => undefined)
  }

  async markRead(conversationId: string, upTo: string) {
    await run('conversations.markRead',
      () => supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId, p_up_to: upTo }),
      () => undefined)
  }
}

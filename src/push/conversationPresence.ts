import { supabase } from '../supabaseClient'

// Presence tells the backend "this member is looking at this conversation
// right now", so the fan-out trigger and the sender can both skip a push
// that would land on a screen the user is already reading.
//
// The heartbeat is deliberately conservative: a tab that is merely open in
// the background does NOT count as present. Only a visible, focused window
// showing that conversation does — otherwise a laptop left open on the
// family chat would silently swallow every notification for that
// conversation on the user's phone too.

export const PRESENCE_HEARTBEAT_MS = 30_000

export interface PresenceInput {
  conversationId: string | null
  visible: boolean
  focused: boolean
}

/** Pure decision so the rule can be tested without a DOM or a network. */
export function isPresent(input: PresenceInput): boolean {
  return Boolean(input.conversationId) && input.visible && input.focused
}

export function readPresenceInput(conversationId: string | null): PresenceInput {
  if (typeof document === 'undefined') return { conversationId, visible: false, focused: false }
  return {
    conversationId,
    visible: document.visibilityState === 'visible',
    focused: typeof document.hasFocus === 'function' ? document.hasFocus() : true,
  }
}

// Presence is best-effort. A failed heartbeat must never surface an error to
// the user or block the chat: the worst case is one redundant push.
export async function touchConversationPresence(conversationId: string) {
  const { error } = await supabase.rpc('touch_conversation_presence', { p_conversation_id: conversationId })
  return !error
}

export async function clearConversationPresence(conversationId: string) {
  const { error } = await supabase.rpc('clear_conversation_presence', { p_conversation_id: conversationId })
  return !error
}

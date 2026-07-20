import type { MessageRow } from './types'

// Wave 5 transport boundary.
//
// The `messages` table has exactly one realtime owner — the global summary
// layer — because unread counts must stay correct on every screen, not only
// on /messages. The route-scoped content layer must nevertheless see the same
// inserts to render a live thread, so the summary re-broadcasts each row
// through this tiny emitter instead of opening a second subscription.
//
// One subscription, one owner, two independent stores: no event is applied
// twice inside the same store, and neither store is derived from the other.

export type MessageStreamEvent =
  | { type: 'insert'; row: MessageRow }
  | { type: 'update'; row: MessageRow }
  | { type: 'delete'; id: string; conversationId: string }

export type MessageStreamListener = (event: MessageStreamEvent) => void

export interface MessageStream {
  subscribe: (listener: MessageStreamListener) => () => void
  emit: (event: MessageStreamEvent) => void
  /** Listener count — development diagnostics and tests only. */
  size: () => number
}

export function createMessageStream(): MessageStream {
  const listeners = new Set<MessageStreamListener>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(event) {
      // Copy first: a listener that unsubscribes while handling an event
      // must not perturb this iteration.
      for (const listener of [...listeners]) listener(event)
    },
    size: () => listeners.size,
  }
}

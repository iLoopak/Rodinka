import type { MessageRow } from './types'

// Pure merge rules for the conversation thread. Kept free of the supabase
// client so tests (and, since Wave 5, the summary layer's unread bookkeeping)
// can import them without dragging the content data source into the bundle.

export function compareMessages(a: MessageRow, b: MessageRow) {
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

import type { MessageRow } from './types'

// The summary layer counts unread messages without holding message bodies.
//
// Before Wave 5 the count was derived from the full in-memory message list,
// which is exactly why the whole chat had to be loaded globally. A mark is the
// minimum a count needs: an id (to dedupe and to drop on delete) and the
// timestamp it is compared against `last_read_at`. No body, no sender name, no
// attachment — nothing that would make this a second copy of the thread.

export interface UnreadMark {
  id: string
  createdAt: string
}

/** Conversation id → the marks currently known for it. */
export type UnreadMarks = Record<string, UnreadMark[]>

/**
 * A message only counts towards unread if somebody else sent it and it has
 * not been deleted — the same two rules the pre-split derivation applied.
 * Returns null for anything that must never be counted.
 */
export function markFor(row: MessageRow, currentMemberId: string | undefined): UnreadMark | null {
  if (!row.id || row.id.startsWith('pending:')) return null
  if (currentMemberId && row.sender_member_id === currentMemberId) return null
  if (row.deleted_at) return null
  return { id: row.id, createdAt: row.created_at }
}

export function addMark(marks: UnreadMarks, conversationId: string, mark: UnreadMark): UnreadMarks {
  const existing = marks[conversationId]
  // Untracked conversation: the approximate "has something new" rule is in
  // charge until the content layer reports a loaded page, so do not start
  // tracking here or the two rules would disagree mid-session.
  if (!existing) return marks
  if (existing.some((m) => m.id === mark.id)) return marks
  return { ...marks, [conversationId]: [...existing, mark] }
}

export function removeMark(marks: UnreadMarks, conversationId: string, messageId: string): UnreadMarks {
  const existing = marks[conversationId]
  if (!existing) return marks
  const next = existing.filter((m) => m.id !== messageId)
  if (next.length === existing.length) return marks
  return { ...marks, [conversationId]: next }
}

/**
 * Called when the content layer has loaded a page of a conversation. From
 * this point the conversation is tracked and its badge shows an exact count
 * rather than the "at least one" approximation.
 */
export function registerMarks(
  marks: UnreadMarks,
  conversationId: string,
  rows: MessageRow[],
  currentMemberId: string | undefined,
): UnreadMarks {
  const existing = marks[conversationId] ?? []
  const byId = new Map(existing.map((m) => [m.id, m]))
  for (const row of rows) {
    const mark = markFor(row, currentMemberId)
    if (mark) byId.set(mark.id, mark)
    else byId.delete(row.id)
  }
  return { ...marks, [conversationId]: [...byId.values()] }
}

export function isTracked(marks: UnreadMarks, conversationId: string): boolean {
  return marks[conversationId] !== undefined
}

export function countUnread(marks: UnreadMarks, conversationId: string, lastReadAt: string): number {
  const existing = marks[conversationId]
  if (!existing) return 0
  let count = 0
  for (const mark of existing) if (mark.createdAt > lastReadAt) count += 1
  return count
}

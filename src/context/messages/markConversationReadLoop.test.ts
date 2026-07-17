import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Regression pin for the "send always fails on direct chat" bug.
//
// The user-visible symptom was: opening a 1:1 conversation and clicking
// "send" always returned "TypeError: Failed to fetch" for
// send_message. The real cause wasn't the send RPC — it was
// mark_conversation_read firing in an unbounded loop:
//
//   1. ConversationDetail runs `useEffect(() => { if (loaded) onMarkRead() },
//      [loaded, conversation.id, onMarkRead])`.
//   2. MessagesScreen was passing `onMarkRead={() =>
//      markConversationRead(activeConversation.id)}` — a new arrow on
//      every parent render.
//   3. markConversationRead calls setMembers with a fresh array, which
//      re-renders the provider, which re-renders MessagesScreen, which
//      creates yet another arrow, which retriggers the effect. Loop.
//   4. In one instrumented sample we counted 46,589 mark_conversation_read
//      requests in a few seconds. The browser eventually throttles the
//      Supabase host and every request — including send_message —
//      starts failing with "TypeError: Failed to fetch".
//
// The fix has two parts and this test pins both so a future refactor
// can't silently reintroduce the loop:
//
//   - MessagesScreen must NOT pass inline arrows for the props that
//     ConversationDetail lists in its useEffect deps.
//   - markConversationRead itself must coalesce bursts so that a
//     future accidental hot path is capped, not fatal.

const messagesScreen = readFileSync(
  new URL('../../components/messages/MessagesScreen.tsx', import.meta.url),
  'utf8',
)
const dataSource = readFileSync(
  new URL('./useMessagesDataSource.ts', import.meta.url),
  'utf8',
)

describe('mark_conversation_read runaway loop guard', () => {
  it('MessagesScreen does not pass an inline arrow for onMarkRead', () => {
    // Any `onMarkRead={() => ...}` in this file is the exact shape
    // that used to feed the loop.
    expect(messagesScreen).not.toMatch(/onMarkRead=\{\s*\(\s*\)\s*=>/)
    // Positive form: it MUST feed the memoized handler through.
    expect(messagesScreen).toMatch(/onMarkRead=\{handleMarkRead\}/)
  })

  it('MessagesScreen stabilizes handleMarkRead with useCallback keyed on the active conversation', () => {
    // If someone drops the useCallback wrapper the handler goes back
    // to being reference-unstable across renders — same failure mode
    // as an inline arrow.
    expect(messagesScreen).toMatch(/const handleMarkRead = useCallback\(/)
    expect(messagesScreen).toMatch(/\[activeId, markConversationRead\]/)
  })

  it('markConversationRead coalesces bursts so an accidental hot path is bounded', () => {
    // Belt-and-braces defense: even if someone reintroduces an
    // effect that calls onMarkRead every render, the RPC is capped
    // via a short debounce window and an in-flight guard.
    expect(dataSource).toMatch(/markReadInFlightRef/)
    expect(dataSource).toMatch(/lastMarkReadAtRef/)
    // Must guard BEFORE the RPC, not after — otherwise the RPC still
    // fires on every render.
    const body = dataSource.match(
      /const markConversationRead = useCallback\(async[\s\S]+?\}, \[currentMemberId\]\)/,
    )?.[0] ?? ''
    expect(body).toMatch(/if \(markReadInFlightRef\.current\.has\(conversationId\)\) return/)
    expect(body).toMatch(/nowMs - lastAt < 500/)
    // The RPC call must appear AFTER both guards.
    const rpcIndex = body.indexOf("supabase.rpc('mark_conversation_read'")
    const inflightIndex = body.indexOf('markReadInFlightRef.current.has')
    const debounceIndex = body.indexOf('nowMs - lastAt < 500')
    expect(rpcIndex).toBeGreaterThan(inflightIndex)
    expect(rpcIndex).toBeGreaterThan(debounceIndex)
  })

  it('markConversationRead never rewinds the cursor via setMembers', () => {
    // The optimistic setMembers path must skip when the cursor is
    // already at-or-past `now`. Without this guard, out-of-order
    // realtime UPDATEs could drag the cursor backwards.
    const body = dataSource.match(
      /const markConversationRead = useCallback\(async[\s\S]+?\}, \[currentMemberId\]\)/,
    )?.[0] ?? ''
    expect(body).toMatch(/target\.last_read_at >= now/)
  })
})

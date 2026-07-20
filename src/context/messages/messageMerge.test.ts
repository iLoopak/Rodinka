import { describe, expect, it } from 'vitest'
import type { MessageRow } from './types'
// Since Wave 5 these merge rules live in their own supabase-free module, so
// the test imports them directly instead of stubbing env for the data source.
import { mergeIncomingMessage, mergeInitialLoad } from './messageMerge'

// Reproduction of the "message appears briefly then disappears" bug.
// The failure mode was:
//   1. User opens the family chat — loadInitialMessages fires a fetch.
//   2. Any parent re-render (realtime status flip, family-members
//      update) refires the same effect while the first fetch is still
//      in flight, so a SECOND initial-load fetch is issued.
//   3. User sends a message — optimistic + RPC put the real row into
//      state.
//   4. The second fetch returns its own snapshot (taken BEFORE the
//      send) and, back when this was a blind replace, wiped the row.
//
// The fix has two parts: an in-flight ref so the second fetch never
// starts, and a merge so that even a late fetch can only re-populate
// missing history without ever dropping a locally known row. This test
// pins the merge half — the in-flight half is guarded by a ref and can
// only be observed via integration, not unit.

function baseRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'server-1',
    conversation_id: 'conv-1',
    family_id: 'fam-1',
    sender_member_id: 'member-1',
    content_type: 'text',
    body: 'hi',
    client_id: null,
    reply_to_message_id: null,
    system_kind: null,
    edited_at: null,
    deleted_at: null,
    has_attachments: false,
    created_at: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

describe('mergeInitialLoad', () => {
  it('returns server rows unchanged when the client has nothing', () => {
    const server = [baseRow({ id: 'srv-a', created_at: '2026-07-17T09:00:00Z' })]
    expect(mergeInitialLoad(undefined, server)).toBe(server)
    expect(mergeInitialLoad([], server)).toBe(server)
  })

  it('never drops a pending optimistic send that arrived during the load', () => {
    const server = [baseRow({ id: 'srv-a', created_at: '2026-07-17T09:00:00Z' })]
    const pending = baseRow({
      id: 'pending:abc',
      client_id: 'abc',
      body: 'D',
      created_at: '2026-07-17T09:00:05Z',
      deliveryStatus: 'sending',
    })
    const merged = mergeInitialLoad([pending], server)
    expect(merged.map((m) => m.id)).toEqual(['srv-a', 'pending:abc'])
  })

  it('keeps a failed local send so the user can still retry it', () => {
    const server = [baseRow({ id: 'srv-a' })]
    const failed = baseRow({
      id: 'pending:xyz',
      client_id: 'xyz',
      created_at: '2026-07-17T10:05:00Z',
      deliveryStatus: 'failed',
      deliveryError: 'network',
    })
    const merged = mergeInitialLoad([failed], server)
    expect(merged.some((m) => m.deliveryStatus === 'failed')).toBe(true)
  })

  it('lets the server row win when it already carries the same client_id', () => {
    // This is the ordering where the RPC finished BEFORE the load — the
    // optimistic row already got re-keyed to `srv-D`, and the load must
    // NOT resurrect the pending ghost as a duplicate.
    const server = [baseRow({ id: 'srv-D', client_id: 'abc' })]
    const optimistic = baseRow({
      id: 'pending:abc',
      client_id: 'abc',
      deliveryStatus: 'sending',
    })
    const merged = mergeInitialLoad([optimistic], server)
    expect(merged.map((m) => m.id)).toEqual(['srv-D'])
  })

  it('preserves realtime rows that landed during the load window', () => {
    const server = [baseRow({ id: 'srv-a', created_at: '2026-07-17T09:00:00Z' })]
    const realtimeRow = baseRow({
      id: 'srv-b',
      body: 'from another member',
      created_at: '2026-07-17T09:00:10Z',
    })
    const merged = mergeInitialLoad([realtimeRow], server)
    expect(merged.map((m) => m.id)).toEqual(['srv-a', 'srv-b'])
  })

  it('does not duplicate a row when the server snapshot already includes it', () => {
    const server = [
      baseRow({ id: 'srv-a', created_at: '2026-07-17T09:00:00Z' }),
      baseRow({ id: 'srv-b', created_at: '2026-07-17T09:00:10Z' }),
    ]
    const clientOverlap = [baseRow({ id: 'srv-b' })]
    const merged = mergeInitialLoad(clientOverlap, server)
    expect(merged.map((m) => m.id)).toEqual(['srv-a', 'srv-b'])
  })
})

describe('mergeIncomingMessage', () => {
  it('captures a realtime insert for a conversation whose initial load is in flight', () => {
    // The old behaviour returned `current` untouched when
    // `current[conversation_id]` was undefined, which silently
    // dropped realtime rows that arrived while the initial fetch was
    // still running. Now the row is captured against an empty list.
    const next = baseRow({ id: 'realtime-1', conversation_id: 'conv-new' })
    const merged = mergeIncomingMessage({}, next)
    expect(merged['conv-new']).toEqual([next])
  })

  it('replaces an optimistic ghost with the server row on realtime echo', () => {
    const optimistic = baseRow({
      id: 'pending:abc',
      client_id: 'abc',
      deliveryStatus: 'sending',
    })
    const echo = baseRow({ id: 'srv-D', client_id: 'abc' })
    const merged = mergeIncomingMessage({ 'conv-1': [optimistic] }, echo)
    const list = merged['conv-1']
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('srv-D')
    expect(list[0].deliveryStatus).toBe('sent')
  })

  it('deduplicates a second realtime event with the same id', () => {
    const row = baseRow({ id: 'srv-A' })
    const first = mergeIncomingMessage({ 'conv-1': [] }, row)
    const second = mergeIncomingMessage(first, row)
    expect(second['conv-1']).toHaveLength(1)
  })

  it('allows two distinct rows with the same body sent by the same author', () => {
    // Make sure the dedup path never collapses two messages with
    // identical text — those must remain visible.
    const a = baseRow({ id: 'srv-1', body: 'ok', client_id: 'a' })
    const b = baseRow({ id: 'srv-2', body: 'ok', client_id: 'b' })
    const step1 = mergeIncomingMessage({ 'conv-1': [] }, a)
    const step2 = mergeIncomingMessage(step1, b)
    expect(step2['conv-1'].map((m) => m.id)).toEqual(['srv-1', 'srv-2'])
  })
})

import { describe, expect, it } from 'vitest'
import { addMark, countUnread, isTracked, markFor, registerMarks, removeMark } from './unreadMarks'
import type { MessageRow } from './types'

const base: MessageRow = {
  id: 'm1',
  conversation_id: 'c1',
  family_id: 'f1',
  sender_member_id: 'other',
  content_type: 'text',
  body: 'ahoj',
  client_id: null,
  reply_to_message_id: null,
  system_kind: null,
  edited_at: null,
  deleted_at: null,
  has_attachments: false,
  created_at: '2026-07-20T10:00:00Z',
}

const message = (over: Partial<MessageRow>): MessageRow => ({ ...base, ...over })

describe('unread marks', () => {
  it('never counts the reader own messages', () => {
    expect(markFor(message({ sender_member_id: 'me' }), 'me')).toBeNull()
  })

  it('never counts a deleted message', () => {
    expect(markFor(message({ deleted_at: '2026-07-20T11:00:00Z' }), 'me')).toBeNull()
  })

  it('never counts an optimistic row that has no server id yet', () => {
    expect(markFor(message({ id: 'pending:abc', sender_member_id: 'other' }), 'me')).toBeNull()
  })

  it('leaves an untracked conversation untracked so the approximate badge stays in charge', () => {
    // Until the content layer reports a loaded page there is no honest exact
    // count — starting to track here would make the badge disagree with
    // itself mid-session.
    const next = addMark({}, 'c1', { id: 'm1', createdAt: base.created_at })
    expect(isTracked(next, 'c1')).toBe(false)
  })

  it('counts only messages newer than the read cursor', () => {
    const marks = registerMarks({}, 'c1', [
      message({ id: 'm1', created_at: '2026-07-20T08:00:00Z' }),
      message({ id: 'm2', created_at: '2026-07-20T10:00:00Z' }),
      message({ id: 'm3', created_at: '2026-07-20T11:00:00Z' }),
    ], 'me')
    expect(isTracked(marks, 'c1')).toBe(true)
    expect(countUnread(marks, 'c1', '2026-07-20T09:00:00Z')).toBe(2)
    expect(countUnread(marks, 'c1', '2026-07-20T23:00:00Z')).toBe(0)
  })

  it('marks a conversation tracked even when it contains nothing to count', () => {
    const marks = registerMarks({}, 'c1', [], 'me')
    expect(isTracked(marks, 'c1')).toBe(true)
    expect(countUnread(marks, 'c1', '2026-07-20T00:00:00Z')).toBe(0)
  })

  it('adds a live message to a tracked conversation exactly once', () => {
    let marks = registerMarks({}, 'c1', [], 'me')
    const mark = { id: 'm9', createdAt: '2026-07-20T12:00:00Z' }
    marks = addMark(marks, 'c1', mark)
    marks = addMark(marks, 'c1', mark)
    expect(countUnread(marks, 'c1', '2026-07-20T09:00:00Z')).toBe(1)
  })

  it('drops a message that was soft-deleted after it was counted', () => {
    let marks = registerMarks({}, 'c1', [message({ id: 'm1' })], 'me')
    expect(countUnread(marks, 'c1', '2026-07-20T09:00:00Z')).toBe(1)
    marks = removeMark(marks, 'c1', 'm1')
    expect(countUnread(marks, 'c1', '2026-07-20T09:00:00Z')).toBe(0)
  })

  it('drops a message when a later page reports it as deleted', () => {
    let marks = registerMarks({}, 'c1', [message({ id: 'm1' })], 'me')
    marks = registerMarks(marks, 'c1', [message({ id: 'm1', deleted_at: '2026-07-20T12:00:00Z' })], 'me')
    expect(countUnread(marks, 'c1', '2026-07-20T09:00:00Z')).toBe(0)
  })

  it('keeps a mark once, even if an older page repeats it', () => {
    let marks = registerMarks({}, 'c1', [message({ id: 'm1' })], 'me')
    marks = registerMarks(marks, 'c1', [message({ id: 'm1' }), message({ id: 'm2' })], 'me')
    expect(countUnread(marks, 'c1', '2026-07-20T09:00:00Z')).toBe(2)
  })

  it('keeps conversations independent', () => {
    let marks = registerMarks({}, 'c1', [message({ id: 'm1' })], 'me')
    marks = registerMarks(marks, 'c2', [message({ id: 'm2', conversation_id: 'c2' })], 'me')
    marks = removeMark(marks, 'c1', 'm1')
    expect(countUnread(marks, 'c1', '2026-07-20T09:00:00Z')).toBe(0)
    expect(countUnread(marks, 'c2', '2026-07-20T09:00:00Z')).toBe(1)
  })
})

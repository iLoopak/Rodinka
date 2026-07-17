import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260718100000_family_messaging.sql', import.meta.url),
  'utf8',
)

describe('family messaging migration', () => {
  it('creates the four core tables the batch requires', () => {
    expect(migration).toMatch(/create table if not exists public\.conversations/)
    expect(migration).toMatch(/create table if not exists public\.conversation_members/)
    expect(migration).toMatch(/create table if not exists public\.messages/)
    // A conversation.last_message_at + conversation_members.last_read_at is
    // the "message_read_state or equivalent" bit — asserting the columns
    // rather than the shape, so future refactors can still swap it out.
    expect(migration).toMatch(/last_read_at timestamptz not null default 'epoch'/)
    expect(migration).toMatch(/last_message_at timestamptz/)
  })

  it('deduplicates the family group and direct conversations at the schema layer', () => {
    expect(migration).toMatch(/create unique index[^\n]*conversations_family_group_unique[^\n]*\n\s+on public\.conversations \(family_id\)[^\n]*\n\s+where kind = 'group'/)
    expect(migration).toMatch(/create unique index[^\n]*conversations_family_direct_unique[^\n]*\n\s+on public\.conversations \(family_id, direct_key\)[^\n]*\n\s+where kind = 'direct'/)
    expect(migration).toContain("public.direct_conversation_key(a uuid, b uuid)")
  })

  it('scopes conversation and message reads to actual participants (not just family members)', () => {
    expect(migration).toContain('create policy "participants read conversations" on public.conversations for select')
    expect(migration).toContain('public.is_conversation_participant(id)')
    expect(migration).toContain('create policy "participants read messages" on public.messages for select')
    expect(migration).toContain('public.is_conversation_participant(conversation_id)')
    // No blanket family-only reads that would let a parent peek at a
    // sibling-to-sibling direct thread.
    expect(migration).not.toMatch(/on public\.messages for select[^\n]*using \(is_family_member/i)
  })

  it('routes every write through security-definer RPCs, not direct INSERTs', () => {
    expect(migration).not.toMatch(/on public\.messages for insert/i)
    expect(migration).not.toMatch(/on public\.conversations for insert/i)
    expect(migration).not.toMatch(/on public\.conversation_members for insert/i)
    expect(migration).toContain('function public.send_message(')
    expect(migration).toContain('security definer')
    expect(migration).toContain('function public.ensure_family_group_conversation(p_family_id uuid)')
    expect(migration).toContain('function public.ensure_direct_conversation(p_other_member_id uuid)')
  })

  it('rejects cross-family message rows and non-participant senders', () => {
    expect(migration).toContain('Message family does not match conversation family')
    expect(migration).toContain('Sender must be a member of the conversation family')
    expect(migration).toContain('Sender is not a participant of this conversation')
    expect(migration).toContain('Recipient must belong to the same family')
    expect(migration).toContain('Conversation members must belong to the same family')
  })

  it('freezes direct conversations at two participants and blocks self-DMs', () => {
    expect(migration).toContain('Direct conversation already has both members')
    expect(migration).toContain('Cannot start a direct conversation with yourself')
  })

  it('supports client-id idempotency for optimistic sends', () => {
    expect(migration).toContain('messages_conversation_client_unique')
    expect(migration).toMatch(/if p_client_id is not null then[\s\S]+?return inserted;/)
  })

  it('backfills the family group conversation on member insert/reactivation', () => {
    expect(migration).toContain('members_attach_to_family_group_insert')
    expect(migration).toContain('members_attach_to_family_group_update')
    expect(migration).toContain("insert into public.conversation_members (conversation_id, member_id)")
  })

  it('publishes the messaging tables to realtime with REPLICA IDENTITY FULL', () => {
    for (const table of ['conversations', 'conversation_members', 'messages']) {
      expect(migration).toContain(`'${table}'`)
    }
    expect(migration).toContain('replica identity full')
    expect(migration).toContain("pubname = 'supabase_realtime'")
  })

  it('grants the RPC surface exclusively to authenticated', () => {
    expect(migration).toContain('grant execute on function public.send_message(uuid, text, uuid, uuid) to authenticated')
    expect(migration).toContain('grant execute on function public.mark_conversation_read(uuid, timestamptz) to authenticated')
    expect(migration).toContain('grant execute on function public.ensure_family_group_conversation(uuid) to authenticated')
    expect(migration).toContain('grant execute on function public.ensure_direct_conversation(uuid) to authenticated')
    expect(migration).not.toContain('grant execute on function public.attach_member_to_family_group() to authenticated')
  })
})

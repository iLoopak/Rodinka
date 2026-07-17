import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260719120000_family_messaging_batch2.sql', import.meta.url),
  'utf8',
)

describe('family messaging batch 2 migration', () => {
  it('adds the reactions and attachments tables with family scoping', () => {
    expect(migration).toMatch(/create table if not exists public\.message_reactions/)
    expect(migration).toMatch(/create table if not exists public\.message_attachments/)
    // Family id is denormalized on both so the realtime filter
    // `family_id=eq.<id>` stays cheap on the hottest tables.
    expect(migration).toMatch(/message_reactions[\s\S]+family_id uuid not null references public\.families/)
    expect(migration).toMatch(/message_attachments[\s\S]+family_id uuid not null references public\.families/)
  })

  it('prevents multiple identical reactions from the same member via composite PK', () => {
    expect(migration).toMatch(/primary key \(message_id, member_id, emoji\)/)
  })

  it('lets a single member post multiple different emoji reactions on the same message', () => {
    // Composite key includes emoji, so (member, message, ❤️) and
    // (member, message, 😂) coexist. Explicit assertion so a future
    // "one-reaction-per-user" refactor breaks this test loudly.
    const primaryKey = migration.match(/message_reactions[\s\S]+?primary key \(([^)]+)\)/)
    expect(primaryKey?.[1]).toContain('emoji')
  })

  it('routes every mutation through security-definer RPCs, not direct writes', () => {
    expect(migration).not.toMatch(/on public\.message_reactions for insert/i)
    expect(migration).not.toMatch(/on public\.message_reactions for delete/i)
    expect(migration).not.toMatch(/on public\.message_attachments for insert/i)
    expect(migration).not.toMatch(/on public\.message_attachments for delete/i)
    expect(migration).toContain('function public.edit_message(')
    expect(migration).toContain('function public.delete_message(')
    expect(migration).toContain('function public.add_message_reaction(')
    expect(migration).toContain('function public.remove_message_reaction(')
    expect(migration).toContain('function public.set_conversation_mute(')
    expect(migration).toContain('function public.register_message_attachment(')
    expect(migration).toContain('function public.discard_pending_attachment(')
    expect(migration).toContain('security definer')
  })

  it('locks edit and delete to the original author', () => {
    // Both RPCs check actor.id <> target.sender_member_id and raise.
    // A parent-as-moderator flow is out of scope for this batch —
    // there must be no implicit family-admin override in the
    // author-only checks.
    const editBlock = migration.match(/function public\.edit_message\(([\s\S]+?)\$\$;\s*$/m)?.[1] ?? ''
    const deleteBlock = migration.match(/function public\.delete_message\(([\s\S]+?)\$\$;\s*$/m)?.[1] ?? ''
    // Both check actor.id <> target.sender_member_id
    expect(editBlock).toContain('Only the author may edit this message')
    expect(deleteBlock).toContain('Only the author may delete this message')
    expect(editBlock).not.toMatch(/is_family_admin|is_active_family_adult/i)
    expect(deleteBlock).not.toMatch(/is_family_admin|is_active_family_adult/i)
  })

  it('erases the body on soft delete so realtime cannot leak the original text', () => {
    expect(migration).toMatch(/set body = ''/)
    expect(migration).toMatch(/has_attachments = false/)
    // reactions/attachments are dropped before the row flips deleted_at
    expect(migration).toMatch(/delete from public\.message_attachments where message_id = target\.id/)
    expect(migration).toMatch(/delete from public\.message_reactions where message_id = target\.id/)
  })

  it('validates attachment metadata: bucket, family scoping, mime + size', () => {
    expect(migration).toContain("mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')")
    expect(migration).toMatch(/byte_size[^\n]*<= 8388608/)
    // Storage path MUST start with the family id — this is the DB
    // enforcement that matches the storage policy so the two can
    // never disagree.
    expect(migration).toContain("split_part(new.storage_path, '/', 1) <> new.family_id::text")
    expect(migration).toMatch(/create trigger message_attachments_validate/)
  })

  it('creates and locks down the message-attachments storage bucket', () => {
    expect(migration).toContain("'message-attachments'")
    expect(migration).toMatch(/allowed_mime_types\s*=\s*excluded\.allowed_mime_types/)
    expect(migration).toMatch(/public = false/)
    // family_id, conversation_id, and file uuid.ext are the three
    // required path segments before write is allowed.
    expect(migration).toMatch(/cardinality\(string_to_array\(object_name, '\/'\)\) < 3/)
    expect(migration).toMatch(/split_part\(object_name, '\/', 3\) !~\* '\^\[0-9a-f-\]\+\\.\(jpe\?g\|png\|webp\|gif\)\$'/)
    // Read requires being an active member of the owning family.
    expect(migration).toContain('public.is_active_family_member((split_part(object_name, \'/\', 1))::uuid)')
    // Write additionally requires participation in the conversation
    // the file is being uploaded to.
    expect(migration).toContain('join public.conversation_members cm')
  })

  it('adds mute_scope with three valid values and a self-update RPC', () => {
    expect(migration).toMatch(/mute_scope[\s\S]{0,120}?check \(mute_scope in \('none', 'messages', 'all'\)\)/)
    expect(migration).toContain('function public.set_conversation_mute(')
    expect(migration).toContain("Invalid mute scope")
  })

  it('extends send_message with attachment ids and preserves optimistic client-id dedup', () => {
    expect(migration).toContain('function public.send_message(')
    expect(migration).toContain('p_attachment_ids uuid[]')
    // The idempotency branch must still return the existing row when
    // the same client_id shows up twice (retry path).
    expect(migration).toMatch(/if p_client_id is not null then[\s\S]+?return inserted;/)
  })

  it('rejects attempts to attach a file the caller does not own', () => {
    // register_message_attachment: caller-owned message check.
    expect(migration).toContain("Cannot attach to another member''s message")
    // discard_pending_attachment: caller-owned attachment check.
    expect(migration).toContain("Cannot discard another member''s attachment")
    // send_message: only rows already in this family + conversation
    // are bound, so a hostile caller can't steal another family's
    // attachment id.
    expect(migration).toContain('a.family_id = conv.family_id')
    expect(migration).toContain('a.conversation_id = conv.id')
  })

  it('grants the RPC surface exclusively to authenticated', () => {
    expect(migration).toContain('grant execute on function public.edit_message(uuid, text) to authenticated')
    expect(migration).toContain('grant execute on function public.delete_message(uuid) to authenticated')
    expect(migration).toContain('grant execute on function public.add_message_reaction(uuid, text) to authenticated')
    expect(migration).toContain('grant execute on function public.remove_message_reaction(uuid, text) to authenticated')
    expect(migration).toContain('grant execute on function public.set_conversation_mute(uuid, text) to authenticated')
    expect(migration).toContain('grant execute on function public.send_message(uuid, text, uuid, uuid, uuid[]) to authenticated')
    expect(migration).toContain('grant execute on function public.register_message_attachment(uuid, text, text, bigint, integer, integer, uuid) to authenticated')
    expect(migration).toContain('grant execute on function public.discard_pending_attachment(uuid) to authenticated')
  })

  it('publishes the two new tables to realtime with REPLICA IDENTITY FULL', () => {
    expect(migration).toMatch(/replica identity full/)
    expect(migration).toContain("'message_reactions'")
    expect(migration).toContain("'message_attachments'")
    expect(migration).toContain("pubname = 'supabase_realtime'")
  })
})

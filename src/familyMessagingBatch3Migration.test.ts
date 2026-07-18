import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260719140000_message_entity_references.sql', import.meta.url),
  'utf8',
)

describe('family messaging batch 3 — entity references migration', () => {
  it('adds a single polymorphic reference table, not a column per type', () => {
    expect(migration).toMatch(/create table if not exists public\.message_entity_refs/)
    // Polymorphic keying.
    expect(migration).toMatch(/entity_type text not null[\s\S]*?check \(entity_type in \('task', 'shopping_item', 'event', 'reminder'\)\)/)
    expect(migration).toMatch(/entity_id uuid not null/)
    // NOT a nullable fk column per entity type.
    expect(migration).not.toMatch(/task_id uuid references/)
    expect(migration).not.toMatch(/shopping_item_id uuid references/)
  })

  it('denormalizes family_id + conversation_id for RLS/realtime parity', () => {
    expect(migration).toMatch(/family_id uuid not null references public\.families/)
    expect(migration).toMatch(/conversation_id uuid not null references public\.conversations/)
  })

  it('keeps only safe fallback metadata for deleted entities', () => {
    expect(migration).toMatch(/fallback_label text/)
    expect(migration).toMatch(/fallback_meta jsonb not null default '\{\}'::jsonb/)
  })

  it('routes every write through security-definer RPCs, not direct writes', () => {
    // No INSERT/UPDATE/DELETE policy on the table.
    expect(migration).not.toMatch(/on public\.message_entity_refs for insert/i)
    expect(migration).not.toMatch(/on public\.message_entity_refs for update/i)
    expect(migration).not.toMatch(/on public\.message_entity_refs for delete/i)
    // Only a participant SELECT policy.
    expect(migration).toMatch(/create policy "participants read message entity refs" on public\.message_entity_refs for select/)
    expect(migration).toContain('function public.share_entity_to_conversation(')
    expect(migration).toContain('function public.resolve_message_entities(')
    expect(migration).toContain('function public.post_entity_system_message(')
    expect(migration).toContain('security definer')
  })

  it('share RPC enforces conversation participation and same-family entity', () => {
    const share = migration.match(/function public\.share_entity_to_conversation\(([\s\S]+?)\$\$;/)?.[0] ?? ''
    expect(share).toContain('Not a participant of this conversation')
    expect(share).toContain('Shared entity belongs to another family')
    expect(share).toContain('Shared entity not found')
    // Reminders are per-member: only the target or a parent/admin may share.
    expect(share).toContain('Cannot share this reminder')
    // Idempotent on client_id like send_message.
    expect(share).toMatch(/where conversation_id = conv\.id and client_id = p_client_id/)
  })

  it('validates the entity belongs to the conversation family at the row level', () => {
    expect(migration).toMatch(/create trigger message_entity_refs_validate/)
    expect(migration).toContain('Shared entity must belong to the conversation family')
    // The guard resolves the entity family per type.
    expect(migration).toMatch(/when 'task' then \(select family_id from public\.chores/)
    expect(migration).toMatch(/when 'shopping_item' then \(select family_id from public\.shopping_items/)
    expect(migration).toMatch(/when 'event' then \(select family_id from public\.activities/)
    expect(migration).toMatch(/when 'reminder' then \(select family_id from public\.reminders/)
  })

  it('resolver re-checks conversation participation so it cannot widen visibility', () => {
    const resolver = migration.match(/function public\.resolve_message_entities\(([\s\S]+?)\$\$;/)?.[0] ?? ''
    expect(resolver).toContain('is_conversation_participant(r.conversation_id)')
    // Reports entity_exists=false for deleted entities and falls back safely.
    expect(resolver).toMatch(/\(resolved\.state is not null\) as entity_exists/)
    expect(resolver).toContain('fallback_label')
    // Reminders that are not the caller's are returned restricted, no description leak.
    expect(resolver).toContain("'restricted', true")
  })

  it('allows an entity-typed message with an optional note', () => {
    expect(migration).toMatch(/check \(content_type in \('text', 'system', 'image', 'entity'\)\)/)
    // Share inserts content_type 'entity'.
    expect(migration).toMatch(/'entity', trimmed, p_client_id/)
  })

  it('keeps system messages restrained: fixed kinds, no preview takeover', () => {
    const sys = migration.match(/function public\.post_entity_system_message\(([\s\S]+?)\$\$;/)?.[0] ?? ''
    expect(sys).toContain("p_kind not in ('task_completed', 'item_purchased', 'responsible_changed', 'entity_removed')")
    // Inserted as a system message with no sender.
    expect(sys).toMatch(/'system', left\(btrim\(coalesce\(p_summary/)
    // Only updated_at moves, not last_message_preview.
    expect(sys).toMatch(/set updated_at = inserted\.created_at/)
    expect(sys).not.toMatch(/post_entity_system_message[\s\S]*last_message_preview/)
  })

  it('publishes the new table to realtime with replica identity full', () => {
    expect(migration).toMatch(/alter table public\.message_entity_refs replica identity full/)
    expect(migration).toMatch(/alter publication supabase_realtime add table public\.message_entity_refs/)
  })
})

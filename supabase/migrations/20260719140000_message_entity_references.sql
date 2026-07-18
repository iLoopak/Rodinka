-- ============================================================
-- Family Messaging — Batch 3: shared app-entity references
--
-- Lets a message carry a live reference to a real family-planner entity
-- (a task/chore, a shopping item, a calendar activity, or a reminder)
-- instead of a dead text snapshot. The card the client renders always
-- reflects the entity's CURRENT state, resolved on read.
--
-- Design notes
--   * ONE polymorphic table (message_entity_refs) keyed by
--     (entity_type, entity_id) — not a nullable column per future type.
--     New card types are a new enum value + a new branch in the resolver,
--     no schema churn.
--   * We deliberately do NOT foreign-key entity_id (it is polymorphic).
--     Referential safety on delete is handled at read time: the resolver
--     reports entity_exists=false and the card falls back to the stored
--     label. `fallback_label`/`fallback_meta` are the ONLY denormalized
--     copy we keep, so a deleted entity still renders a sane "no longer
--     exists" card without leaking stale detail.
--   * family_id + conversation_id are denormalized (as on messages and
--     message_attachments) so the RLS + realtime `family_id=eq.<id>`
--     filter stays cheap and consistent with the rest of the module.
--   * Every write path is a security-definer RPC. Direct writes stay
--     blocked by RLS, exactly like messages/attachments/reactions.
-- ============================================================

-- ------------------------------------------------------------
-- content_type: allow an 'entity' message (a shared card, optionally
-- with an accompanying note). Attachment-only messages already relaxed
-- the body requirement; entity messages get the same treatment below.
-- ------------------------------------------------------------

alter table public.messages
  drop constraint if exists messages_content_type_check;
alter table public.messages
  add constraint messages_content_type_check
    check (content_type in ('text', 'system', 'image', 'entity'));

-- ------------------------------------------------------------
-- Table
-- ------------------------------------------------------------

create table if not exists public.message_entity_refs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('task', 'shopping_item', 'event', 'reminder')),
  entity_id uuid not null,
  -- Minimal, safe fallback so a deleted entity still shows something.
  fallback_label text check (fallback_label is null or char_length(fallback_label) <= 200),
  fallback_meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fallback_meta) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists message_entity_refs_message_idx
  on public.message_entity_refs (message_id);
create index if not exists message_entity_refs_family_idx
  on public.message_entity_refs (family_id);
create index if not exists message_entity_refs_entity_idx
  on public.message_entity_refs (entity_type, entity_id);

alter table public.message_entity_refs enable row level security;
revoke all on table public.message_entity_refs from public, anon;
grant select on table public.message_entity_refs to authenticated;

drop policy if exists "participants read message entity refs" on public.message_entity_refs;
create policy "participants read message entity refs" on public.message_entity_refs for select to authenticated
  using (
    public.is_active_family_member(family_id)
    and public.is_conversation_participant(conversation_id)
  );

-- ------------------------------------------------------------
-- Row-shape guard: the ref's family/conversation must match its message,
-- and the referenced entity must belong to the same family (so a hostile
-- caller cannot pin another family's entity onto a message).
-- ------------------------------------------------------------

create or replace function public.validate_message_entity_ref_row()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  msg public.messages%rowtype;
  entity_family uuid;
begin
  select * into msg from public.messages where id = new.message_id;
  if msg.id is null then
    raise exception 'Entity ref message not found';
  end if;
  if new.family_id <> msg.family_id then
    raise exception 'Entity ref family does not match message';
  end if;
  if new.conversation_id <> msg.conversation_id then
    raise exception 'Entity ref conversation does not match message';
  end if;

  -- Resolve the entity's family (null if the entity no longer exists —
  -- that is allowed: a share can race a delete, and the resolver handles
  -- the missing case).
  entity_family := case new.entity_type
    when 'task' then (select family_id from public.chores where id = new.entity_id)
    when 'shopping_item' then (select family_id from public.shopping_items where id = new.entity_id)
    when 'event' then (select family_id from public.activities where id = new.entity_id)
    when 'reminder' then (select family_id from public.reminders where id = new.entity_id)
  end;
  if entity_family is not null and entity_family <> new.family_id then
    raise exception 'Shared entity must belong to the conversation family';
  end if;

  return new;
end;
$$;

drop trigger if exists message_entity_refs_validate on public.message_entity_refs;
create trigger message_entity_refs_validate
  before insert or update on public.message_entity_refs
  for each row execute function public.validate_message_entity_ref_row();

-- ------------------------------------------------------------
-- share_entity_to_conversation
--
-- Creates an 'entity' message (optionally with an accompanying note) and
-- binds a live reference to it, in one transaction. Mirrors send_message's
-- participant + family checks so sharing can never bypass conversation
-- membership. The entity must be visible to the caller's family.
-- ------------------------------------------------------------

create or replace function public.share_entity_to_conversation(
  p_conversation_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_body text default null,
  p_client_id uuid default null,
  p_fallback_label text default null
) returns public.messages
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
  trimmed text;
  entity_family uuid;
  inserted public.messages%rowtype;
  preview text;
begin
  if p_entity_type not in ('task', 'shopping_item', 'event', 'reminder') then
    raise exception 'Unsupported entity type';
  end if;

  trimmed := btrim(coalesce(p_body, ''));
  if char_length(trimmed) > 4000 then
    raise exception 'Message body is too long';
  end if;

  select * into conv from public.conversations where id = p_conversation_id;
  if conv.id is null then
    raise exception 'Conversation not found';
  end if;

  select * into actor from public.members
    where family_id = conv.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null then
    raise exception 'Active household membership required';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
     where cm.conversation_id = conv.id and cm.member_id = actor.id
  ) then
    raise exception 'Not a participant of this conversation';
  end if;

  -- The entity must exist AND belong to this family. Reminders are
  -- per-member: only the target member or a family parent/admin may
  -- share one.
  entity_family := case p_entity_type
    when 'task' then (select family_id from public.chores where id = p_entity_id)
    when 'shopping_item' then (select family_id from public.shopping_items where id = p_entity_id)
    when 'event' then (select family_id from public.activities where id = p_entity_id)
    when 'reminder' then (select family_id from public.reminders where id = p_entity_id)
  end;
  if entity_family is null then
    raise exception 'Shared entity not found';
  end if;
  if entity_family <> conv.family_id then
    raise exception 'Shared entity belongs to another family';
  end if;
  if p_entity_type = 'reminder' and not exists (
    select 1 from public.reminders r
     where r.id = p_entity_id
       and (
         r.target_member_id = actor.id
         or exists (
           select 1 from public.members me
            where me.id = actor.id and me.role in ('admin', 'parent')
         )
       )
  ) then
    raise exception 'Cannot share this reminder';
  end if;

  -- Idempotent replay on client_id, same contract as send_message.
  if p_client_id is not null then
    select * into inserted from public.messages
      where conversation_id = conv.id and client_id = p_client_id
      limit 1;
    if inserted.id is not null then
      return inserted;
    end if;
  end if;

  insert into public.messages (
    conversation_id, family_id, sender_member_id,
    content_type, body, client_id
  ) values (
    conv.id, conv.family_id, actor.id,
    'entity', trimmed, p_client_id
  ) returning * into inserted;

  insert into public.message_entity_refs (
    message_id, family_id, conversation_id, entity_type, entity_id, fallback_label
  ) values (
    inserted.id, conv.family_id, conv.id, p_entity_type, p_entity_id,
    left(btrim(coalesce(p_fallback_label, '')), 200)
  );

  preview := case
    when trimmed <> '' then left(regexp_replace(trimmed, '\s+', ' ', 'g'), 160)
    when p_entity_type = 'task' then '📋 ' || coalesce(p_fallback_label, '')
    when p_entity_type = 'shopping_item' then '🛒 ' || coalesce(p_fallback_label, '')
    when p_entity_type = 'event' then '📅 ' || coalesce(p_fallback_label, '')
    when p_entity_type = 'reminder' then '⏰ ' || coalesce(p_fallback_label, '')
    else ''
  end;
  update public.conversations
     set last_message_at = inserted.created_at,
         last_message_preview = left(preview, 160),
         updated_at = inserted.created_at
   where id = conv.id;

  update public.conversation_members
     set last_read_at = inserted.created_at
   where conversation_id = conv.id and member_id = actor.id;

  return inserted;
end;
$$;

-- ------------------------------------------------------------
-- resolve_message_entities
--
-- Batch resolver: for a set of message ids the caller can see, return the
-- CURRENT state of every attached entity as a uniform (entity_exists, state)
-- pair. Security definer, but it re-checks that the caller participates in
-- each ref's conversation, so it can never widen visibility. A deleted
-- entity returns entity_exists=false with the stored fallback so the card
-- can say "this no longer exists" without leaking anything.
-- ------------------------------------------------------------

create or replace function public.resolve_message_entities(p_message_ids uuid[])
returns table (
  ref_id uuid,
  message_id uuid,
  entity_type text,
  entity_id uuid,
  entity_exists boolean,
  state jsonb
)
language plpgsql security definer stable
set search_path = public, pg_temp as $$
declare
  actor_user uuid := auth.uid();
begin
  return query
  with visible_refs as (
    select r.*
      from public.message_entity_refs r
     where r.message_id = any (p_message_ids)
       and public.is_conversation_participant(r.conversation_id)
  )
  select
    r.id as ref_id,
    r.message_id,
    r.entity_type,
    r.entity_id,
    (resolved.state is not null) as entity_exists,
    coalesce(
      resolved.state,
      jsonb_build_object('fallback_label', r.fallback_label) || r.fallback_meta
    ) as state
  from visible_refs r
  left join lateral (
    select case r.entity_type
      when 'task' then (
        select jsonb_build_object(
          'title', c.title,
          'description', c.description,
          'assigned_to', c.assigned_to,
          'due_date', c.due_date,
          'category', c.category,
          'priority', c.priority,
          'recurrence_type', c.recurrence_type,
          'reward_enabled', c.reward_enabled,
          'reward_amount', c.reward_amount,
          'reward_currency', c.reward_currency,
          'requires_approval', c.requires_approval,
          'last_completion_status', (
            select cc.status from public.chore_completions cc
             where cc.chore_id = c.id
             order by cc.completed_at desc limit 1
          )
        )
        from public.chores c where c.id = r.entity_id
      )
      when 'shopping_item' then (
        select jsonb_build_object(
          'name', s.name,
          'quantity', s.quantity,
          'unit', s.unit,
          'category', s.category,
          'note', s.note,
          'created_by_member_id', s.created_by_member_id,
          'responsible_member_id', s.responsible_member_id,
          'purchased', s.purchased,
          'purchased_by_member_id', s.purchased_by_member_id,
          'purchased_at', s.purchased_at,
          'archived', (s.archived_at is not null)
        )
        from public.shopping_items s where s.id = r.entity_id
      )
      when 'event' then (
        select jsonb_build_object(
          'title', a.title,
          'category', a.category,
          'kind', a.kind,
          'location', a.location,
          'all_day', a.all_day,
          'start_date', a.start_date,
          'end_date', a.end_date,
          'start_time', a.start_time,
          'end_time', a.end_time,
          'responsible_member_id', a.responsible_member_id,
          'status', a.status,
          'participant_member_ids', (
            select coalesce(jsonb_agg(ap.member_id), '[]'::jsonb)
              from public.activity_participants ap where ap.activity_id = a.id
          )
        )
        from public.activities a where a.id = r.entity_id
      )
      when 'reminder' then (
        select case
          when rm.target_member_id = (
            select id from public.members where user_id = actor_user and family_id = rm.family_id limit 1
          ) or exists (
            select 1 from public.members me
             where me.user_id = actor_user and me.family_id = rm.family_id
               and me.role in ('admin', 'parent')
          )
          then jsonb_build_object(
            'title', rm.title,
            'description', rm.description,
            'target_member_id', rm.target_member_id,
            'event_at', rm.event_at,
            'importance', rm.importance
          )
          -- Visible ref, but not this caller's reminder: minimal state,
          -- no description leak.
          else jsonb_build_object('title', rm.title, 'restricted', true)
        end
        from public.reminders rm where rm.id = r.entity_id
      )
    end as state
  ) resolved on true;
end;
$$;

-- ------------------------------------------------------------
-- post_entity_system_message
--
-- Restrained system notices for the few high-signal actions taken through
-- chat (task completed, item purchased, responsible changed, shared entity
-- removed). content_type='system', no sender. Deliberately narrow: callers
-- pass a fixed `p_kind`, not free text, so this can't become a chat-spam
-- vector.
-- ------------------------------------------------------------

create or replace function public.post_entity_system_message(
  p_conversation_id uuid,
  p_kind text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text
) returns public.messages
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
  inserted public.messages%rowtype;
begin
  if p_kind not in ('task_completed', 'item_purchased', 'responsible_changed', 'entity_removed') then
    raise exception 'Unsupported system message kind';
  end if;
  if p_entity_type not in ('task', 'shopping_item', 'event', 'reminder') then
    raise exception 'Unsupported entity type';
  end if;

  select * into conv from public.conversations where id = p_conversation_id;
  if conv.id is null then
    raise exception 'Conversation not found';
  end if;
  select * into actor from public.members
    where family_id = conv.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null then
    raise exception 'Active household membership required';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
     where cm.conversation_id = conv.id and cm.member_id = actor.id
  ) then
    raise exception 'Not a participant of this conversation';
  end if;

  insert into public.messages (
    conversation_id, family_id, sender_member_id,
    content_type, body, system_kind
  ) values (
    conv.id, conv.family_id, null,
    'system', left(btrim(coalesce(p_summary, '')), 200), p_kind
  ) returning * into inserted;

  -- System messages nudge the conversation's updated_at but not its
  -- preview — they must not dominate the list.
  update public.conversations
     set updated_at = inserted.created_at
   where id = conv.id;

  return inserted;
end;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------

revoke all on function public.validate_message_entity_ref_row() from public, anon, authenticated;
revoke all on function public.share_entity_to_conversation(uuid, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_message_entities(uuid[]) from public, anon, authenticated;
revoke all on function public.post_entity_system_message(uuid, text, text, uuid, text) from public, anon, authenticated;

grant execute on function public.share_entity_to_conversation(uuid, text, uuid, text, uuid, text) to authenticated;
grant execute on function public.resolve_message_entities(uuid[]) to authenticated;
grant execute on function public.post_entity_system_message(uuid, text, text, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Realtime publication for the new table (REPLICA IDENTITY FULL so a
-- DELETE carries family_id for the filter, matching the batch 1/2 tables).
-- ------------------------------------------------------------

do $$
begin
  execute 'alter table public.message_entity_refs replica identity full';
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_entity_refs'
    ) then
    execute 'alter publication supabase_realtime add table public.message_entity_refs';
  end if;
end $$;

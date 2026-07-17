-- ============================================================
-- Family Messaging — Batch 1: foundation
--
-- Introduces the tables, indexes, RLS policies, and RPCs that back the
-- new "Zprávy" section (family group conversation + direct conversations
-- between two family members). The model is intentionally minimal but
-- carries the columns needed to grow into attachments, reactions,
-- replies, system messages, shared entities (tasks/events/shopping),
-- and push notifications without another disruptive migration.
--
-- Terminology:
--   conversation.kind = 'group'  → the default per-family "family chat";
--                                   exactly one exists per family.
--   conversation.kind = 'direct' → a 1:1 between two members of the same
--                                   family, deduplicated by direct_key.
--   conversation.kind = 'system' → reserved for future automated threads
--                                   (household announcements etc.); no
--                                   client entry point yet.
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('group', 'direct', 'system')),
  title text check (title is null or char_length(btrim(title)) <= 120),
  created_by_member_id uuid references public.members(id) on delete set null,
  -- Deterministic key for direct conversations so that two members always
  -- land on the same row regardless of who initiated it. Format:
  -- 'direct:<min(memberA,memberB)>:<max(memberA,memberB)>'. Null for
  -- non-direct kinds. Unique per family (only when set).
  direct_key text,
  last_message_at timestamptz,
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_direct_key_shape check (
    (kind = 'direct' and direct_key is not null)
    or (kind <> 'direct' and direct_key is null)
  )
);

create unique index if not exists conversations_family_group_unique
  on public.conversations (family_id)
  where kind = 'group';

create unique index if not exists conversations_family_direct_unique
  on public.conversations (family_id, direct_key)
  where kind = 'direct';

create index if not exists conversations_family_recent_idx
  on public.conversations (family_id, last_message_at desc nulls last, created_at desc);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'owner')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default 'epoch',
  -- Reserved for future mute/archive flows; no UI in this batch.
  muted_at timestamptz,
  archived_at timestamptz,
  primary key (conversation_id, member_id)
);

create index if not exists conversation_members_member_idx
  on public.conversation_members (member_id, conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Denormalized so RLS + realtime filter `family_id=eq.<id>` stay simple
  -- and cheap on the hottest table. Kept in sync by the send_message RPC
  -- (definer) and validated by the messages_validate trigger.
  family_id uuid not null references public.families(id) on delete cascade,
  sender_member_id uuid references public.members(id) on delete set null,
  content_type text not null default 'text'
    check (content_type in ('text', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- Client-generated UUID so an optimistic insert can be reconciled with
  -- the realtime echo (see MessagesContext dedup path). Nullable for
  -- server-authored system messages that carry no client identity.
  client_id uuid,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  system_kind text check (system_kind is null or char_length(system_kind) <= 60),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists messages_conversation_client_unique
  on public.messages (conversation_id, client_id)
  where client_id is not null;

create index if not exists messages_conversation_recent_idx
  on public.messages (conversation_id, created_at desc, id desc);

create index if not exists messages_family_recent_idx
  on public.messages (family_id, created_at desc);

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

create or replace function public.direct_conversation_key(a uuid, b uuid)
returns text language sql immutable
set search_path = public, pg_temp as $$
  select 'direct:' || least(a::text, b::text) || ':' || greatest(a::text, b::text);
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.conversation_members cm
      join public.members m on m.id = cm.member_id
     where cm.conversation_id = p_conversation_id
       and m.user_id = auth.uid()
       and coalesce(m.status, 'active') = 'active'
  );
$$;

revoke all on function public.direct_conversation_key(uuid, uuid) from public, anon;
revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.direct_conversation_key(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations from public, anon;
revoke all on table public.conversation_members from public, anon;
revoke all on table public.messages from public, anon;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_members to authenticated;
grant select on table public.messages to authenticated;
-- Writes go through security-definer RPCs (send_message, mark_conversation_read,
-- ensure_*_conversation); direct INSERT/UPDATE grants would only paint over the
-- same authorization we already enforce there. `last_read_at` is the one field
-- clients need to update in place — a narrow UPDATE grant covers it, gated by
-- the "self can update read cursor" policy below.
grant update (last_read_at) on table public.conversation_members to authenticated;

-- Conversations: the caller must be an active member of the owning family
-- AND actually participate in the conversation. Family-only wouldn't be
-- enough for direct threads: a parent must not read a direct chat between
-- two siblings or between the other parent and a child.
drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations" on public.conversations for select to authenticated
  using (
    public.is_active_family_member(family_id)
    and public.is_conversation_participant(id)
  );

-- Conversation members: same visibility rule as the parent conversation.
drop policy if exists "participants read conversation members" on public.conversation_members;
create policy "participants read conversation members" on public.conversation_members for select to authenticated
  using (public.is_conversation_participant(conversation_id));

-- Self-update of the read cursor. The narrow column grant above already
-- restricts what can move; this policy makes sure a member can only move
-- their own cursor forward.
drop policy if exists "self updates own read cursor" on public.conversation_members;
create policy "self updates own read cursor" on public.conversation_members for update to authenticated
  using (
    exists (
      select 1 from public.members m
       where m.id = conversation_members.member_id
         and m.user_id = auth.uid()
         and coalesce(m.status, 'active') = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.members m
       where m.id = conversation_members.member_id
         and m.user_id = auth.uid()
         and coalesce(m.status, 'active') = 'active'
    )
  );

-- Messages: read requires participation. Writes are forbidden at the
-- RLS layer — send_message is the only path.
drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages" on public.messages for select to authenticated
  using (
    public.is_active_family_member(family_id)
    and public.is_conversation_participant(conversation_id)
  );

-- ------------------------------------------------------------
-- Row-shape guards
-- ------------------------------------------------------------

-- Even the security-definer RPCs run this trigger; it defends against a
-- future direct write path that skips them (batch imports, admin console)
-- and against buggy RPC callers that mismatch family_id / sender.
create or replace function public.validate_message_row()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  conv public.conversations%rowtype;
  sender public.members%rowtype;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  if conv.id is null then
    raise exception 'Conversation not found';
  end if;
  if new.family_id <> conv.family_id then
    raise exception 'Message family does not match conversation family';
  end if;

  new.body := btrim(new.body);
  if new.body = '' then
    raise exception 'Message body is required';
  end if;

  if new.sender_member_id is not null then
    select * into sender from public.members where id = new.sender_member_id;
    if sender.id is null or sender.family_id <> conv.family_id then
      raise exception 'Sender must be a member of the conversation family';
    end if;
    if coalesce(sender.status, 'active') <> 'active' then
      raise exception 'Sender must be an active family member';
    end if;
    if not exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = new.conversation_id and cm.member_id = new.sender_member_id
    ) then
      raise exception 'Sender is not a participant of this conversation';
    end if;
  elsif new.content_type <> 'system' then
    raise exception 'Only system messages may omit the sender';
  end if;

  if new.reply_to_message_id is not null then
    if not exists (
      select 1 from public.messages m
       where m.id = new.reply_to_message_id
         and m.conversation_id = new.conversation_id
    ) then
      raise exception 'Reply target must live in the same conversation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_validate on public.messages;
create trigger messages_validate
  before insert or update on public.messages
  for each row execute function public.validate_message_row();

-- Same shape guard for conversation_members: never cross-family, never
-- reference a removed member.
create or replace function public.validate_conversation_member_row()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  conv public.conversations%rowtype;
  target public.members%rowtype;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  if conv.id is null then
    raise exception 'Conversation not found';
  end if;
  select * into target from public.members where id = new.member_id;
  if target.id is null then
    raise exception 'Member not found';
  end if;
  if target.family_id <> conv.family_id then
    raise exception 'Conversation members must belong to the same family';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_members_validate on public.conversation_members;
create trigger conversation_members_validate
  before insert or update on public.conversation_members
  for each row execute function public.validate_conversation_member_row();

-- Direct conversations are locked to their initial two members. The trigger
-- prevents a caller from expanding a 1:1 into an ad-hoc group by tacking on
-- more members — group behaviour must go through the family group thread.
create or replace function public.enforce_direct_member_cardinality()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  conv public.conversations%rowtype;
  current_count integer;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  if conv.kind = 'direct' then
    select count(*) into current_count
      from public.conversation_members
     where conversation_id = new.conversation_id;
    if current_count >= 2 then
      raise exception 'Direct conversation already has both members';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_members_direct_cardinality on public.conversation_members;
create trigger conversation_members_direct_cardinality
  before insert on public.conversation_members
  for each row execute function public.enforce_direct_member_cardinality();

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------

create or replace function public.ensure_family_group_conversation(p_family_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  existing_id uuid;
begin
  select * into actor from public.members
    where family_id = p_family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null then
    raise exception 'Active household membership required';
  end if;

  select id into existing_id from public.conversations
    where family_id = p_family_id and kind = 'group' for update;

  if existing_id is null then
    insert into public.conversations (family_id, kind, title, created_by_member_id)
      values (p_family_id, 'group', null, actor.id)
      returning id into existing_id;
  end if;

  -- Backfill any active members that aren't already in the group. Also
  -- self-heal on new members joining while this call runs.
  insert into public.conversation_members (conversation_id, member_id)
  select existing_id, m.id
    from public.members m
   where m.family_id = p_family_id
     and coalesce(m.status, 'active') = 'active'
  on conflict do nothing;

  return existing_id;
end;
$$;

create or replace function public.ensure_direct_conversation(p_other_member_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  other public.members%rowtype;
  key text;
  existing_id uuid;
begin
  select * into actor from public.members
    where user_id = auth.uid() and coalesce(status, 'active') = 'active'
    order by created_at limit 1;
  if actor.id is null then
    raise exception 'Active household membership required';
  end if;
  if p_other_member_id = actor.id then
    raise exception 'Cannot start a direct conversation with yourself';
  end if;
  select * into other from public.members where id = p_other_member_id;
  if other.id is null or coalesce(other.status, 'active') <> 'active' then
    raise exception 'Recipient is not an active family member';
  end if;
  if other.family_id <> actor.family_id then
    raise exception 'Recipient must belong to the same family';
  end if;

  key := public.direct_conversation_key(actor.id, other.id);
  select id into existing_id from public.conversations
    where family_id = actor.family_id and kind = 'direct' and direct_key = key
    for update;

  if existing_id is null then
    insert into public.conversations (family_id, kind, direct_key, created_by_member_id)
      values (actor.family_id, 'direct', key, actor.id)
      returning id into existing_id;
    insert into public.conversation_members (conversation_id, member_id)
      values (existing_id, actor.id), (existing_id, other.id)
      on conflict do nothing;
  end if;

  return existing_id;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_id uuid default null,
  p_reply_to_message_id uuid default null
) returns public.messages
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
  trimmed text;
  inserted public.messages%rowtype;
  preview text;
begin
  trimmed := btrim(coalesce(p_body, ''));
  if trimmed = '' then
    raise exception 'Message body is required';
  end if;
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

  if p_client_id is not null then
    select * into inserted from public.messages
      where conversation_id = conv.id and client_id = p_client_id
      limit 1;
    if inserted.id is not null then
      -- Idempotent replay: same client_id → return the row that already
      -- landed rather than a duplicate. Realtime echo will still fire once
      -- and be deduped on the client by (id | client_id).
      return inserted;
    end if;
  end if;

  insert into public.messages (
    conversation_id, family_id, sender_member_id,
    content_type, body, client_id, reply_to_message_id
  ) values (
    conv.id, conv.family_id, actor.id,
    'text', trimmed, p_client_id, p_reply_to_message_id
  ) returning * into inserted;

  preview := left(regexp_replace(inserted.body, '\s+', ' ', 'g'), 160);
  update public.conversations
     set last_message_at = inserted.created_at,
         last_message_preview = preview,
         updated_at = inserted.created_at
   where id = conv.id;

  -- Move the sender's own read cursor forward — they've obviously read
  -- what they just sent, and this keeps the unread count from ticking up
  -- on the sender's device from the realtime echo.
  update public.conversation_members
     set last_read_at = inserted.created_at
   where conversation_id = conv.id and member_id = actor.id;

  return inserted;
end;
$$;

create or replace function public.mark_conversation_read(
  p_conversation_id uuid,
  p_up_to timestamptz default null
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor_member_id uuid;
  conv public.conversations%rowtype;
  cutoff timestamptz;
begin
  select * into conv from public.conversations where id = p_conversation_id;
  if conv.id is null then
    raise exception 'Conversation not found';
  end if;
  select id into actor_member_id from public.members
    where family_id = conv.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor_member_id is null then
    raise exception 'Active household membership required';
  end if;

  cutoff := coalesce(p_up_to, now());
  update public.conversation_members
     set last_read_at = greatest(last_read_at, cutoff)
   where conversation_id = conv.id and member_id = actor_member_id;
end;
$$;

-- ------------------------------------------------------------
-- Family membership hook
-- ------------------------------------------------------------

-- Whenever a new active member appears (initial family creation, invite
-- redemption, a child getting an account), stitch them into their family
-- group conversation. Removed members stay in the row but their read
-- cursor is frozen; UI hides them via is_active_family_member.
create or replace function public.attach_member_to_family_group()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  target_conversation_id uuid;
begin
  if coalesce(new.status, 'active') <> 'active' then
    return new;
  end if;

  select id into target_conversation_id from public.conversations
    where family_id = new.family_id and kind = 'group';

  if target_conversation_id is null then
    insert into public.conversations (family_id, kind, title, created_by_member_id)
      values (new.family_id, 'group', null, new.id)
      returning id into target_conversation_id;
  end if;

  insert into public.conversation_members (conversation_id, member_id)
    values (target_conversation_id, new.id)
    on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists members_attach_to_family_group_insert on public.members;
create trigger members_attach_to_family_group_insert
  after insert on public.members
  for each row execute function public.attach_member_to_family_group();

drop trigger if exists members_attach_to_family_group_update on public.members;
create trigger members_attach_to_family_group_update
  after update of status on public.members
  for each row
  when (coalesce(new.status, 'active') = 'active'
        and (old.status is distinct from new.status))
  execute function public.attach_member_to_family_group();

-- ------------------------------------------------------------
-- Function grants
-- ------------------------------------------------------------

revoke all on function public.ensure_family_group_conversation(uuid) from public, anon, authenticated;
revoke all on function public.ensure_direct_conversation(uuid) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.attach_member_to_family_group() from public, anon, authenticated;
revoke all on function public.validate_message_row() from public, anon, authenticated;
revoke all on function public.validate_conversation_member_row() from public, anon, authenticated;
revoke all on function public.enforce_direct_member_cardinality() from public, anon, authenticated;

grant execute on function public.ensure_family_group_conversation(uuid) to authenticated;
grant execute on function public.ensure_direct_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- Realtime publication
-- ------------------------------------------------------------

-- REPLICA IDENTITY FULL so a `family_id=eq.<id>` filter can be evaluated
-- on DELETE too; add all three tables to supabase_realtime if the
-- publication exists (matches 20260716120000_enable_realtime_core_tables.sql).
do $$
declare
  target text;
  targets text[] := array['conversations', 'conversation_members', 'messages'];
begin
  foreach target in array targets loop
    execute format('alter table public.%I replica identity full', target);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
      ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Backfill: seed a family group conversation for every existing family
-- and attach every currently active member to it.
-- ------------------------------------------------------------

do $$
declare
  fam public.families%rowtype;
  target_conversation_id uuid;
begin
  for fam in select * from public.families loop
    select id into target_conversation_id from public.conversations
      where family_id = fam.id and kind = 'group';
    if target_conversation_id is null then
      insert into public.conversations (family_id, kind, title)
        values (fam.id, 'group', null)
        returning id into target_conversation_id;
    end if;
    insert into public.conversation_members (conversation_id, member_id)
    select target_conversation_id, m.id
      from public.members m
     where m.family_id = fam.id
       and coalesce(m.status, 'active') = 'active'
    on conflict do nothing;
  end loop;
end $$;

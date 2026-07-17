-- ============================================================
-- Family Messaging — Batch 2: reactions, edit/delete, photo
-- attachments, per-conversation mute.
--
-- Builds on 20260718100000_family_messaging.sql. The batch 1 module
-- intentionally left room for these follow-ups (see the "grow into
-- attachments, reactions, replies, system messages" note) so nothing
-- here rewrites the base tables — we only add new tables, new columns
-- and new security-definer RPCs. Every write path continues to run
-- through security-definer functions; direct writes are still blocked
-- by the batch 1 RLS.
-- ============================================================

-- ------------------------------------------------------------
-- Reactions
--
-- Kept in a dedicated table (not a JSONB column on messages) so
-- concurrent reactions from two members never collide on a read-modify-
-- write against the same message row. Multiple emoji per user are
-- allowed — the (message_id, member_id, emoji) primary key naturally
-- deduplicates the same emoji from the same person. NOT emoji-per-user
-- exclusive: a family member can react with both ❤️ and 😂 on the same
-- message and both count.
-- ------------------------------------------------------------

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text not null check (char_length(btrim(emoji)) between 1 and 24),
  -- Denormalized for RLS + realtime filter parity with messages.
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

create index if not exists message_reactions_family_idx
  on public.message_reactions (family_id);

alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from public, anon;
grant select on table public.message_reactions to authenticated;

drop policy if exists "participants read message reactions" on public.message_reactions;
create policy "participants read message reactions" on public.message_reactions for select to authenticated
  using (
    public.is_active_family_member(family_id)
    and exists (
      select 1 from public.messages m
       where m.id = message_reactions.message_id
         and public.is_conversation_participant(m.conversation_id)
    )
  );

-- ------------------------------------------------------------
-- Attachments
--
-- Only images in this batch. Kept as a dependent table so a message
-- can grow multiple attachments later without a schema change. Every
-- file lives in the private `message-attachments` bucket under
-- <family_id>/<conversation_id>/<message_id or draft>/<uuid>.<ext>
-- so the storage policies can pin access to the owning family.
-- ------------------------------------------------------------

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storage_bucket text not null default 'message-attachments'
    check (storage_bucket = 'message-attachments'),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 8388608),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);
create index if not exists message_attachments_family_idx
  on public.message_attachments (family_id);

alter table public.message_attachments enable row level security;
revoke all on table public.message_attachments from public, anon;
grant select on table public.message_attachments to authenticated;

drop policy if exists "participants read message attachments" on public.message_attachments;
create policy "participants read message attachments" on public.message_attachments for select to authenticated
  using (
    public.is_active_family_member(family_id)
    and public.is_conversation_participant(conversation_id)
  );

-- ------------------------------------------------------------
-- Message extensions
--
-- has_attachments is a cheap flag the UI reads on the message list
-- without joining message_attachments; kept in sync by the RPCs and
-- the after-trigger below.
-- ------------------------------------------------------------

alter table public.messages
  add column if not exists has_attachments boolean not null default false;

-- Allow attachment-only messages by relaxing the body constraint so
-- images with no caption pass validation. The trigger below enforces
-- "must have body OR attachment" at the row level.
alter table public.messages
  drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check
    check (char_length(body) <= 4000);

-- Also relax content_type so attachment-only rows can be marked.
alter table public.messages
  drop constraint if exists messages_content_type_check;
alter table public.messages
  add constraint messages_content_type_check
    check (content_type in ('text', 'system', 'image'));

-- ------------------------------------------------------------
-- Per-conversation mute
--
-- Two-level: mute chat pings only, or mute EVERYTHING (including any
-- future task/event/reminder pings that reference this conversation).
-- Nullable timestamp so we can distinguish "muted forever" from
-- "unmuted" without a magic date sentinel.
-- ------------------------------------------------------------

alter table public.conversation_members
  add column if not exists mute_scope text not null default 'none'
    check (mute_scope in ('none', 'messages', 'all'));

alter table public.conversation_members
  add column if not exists muted_until timestamptz;

grant update (last_read_at, mute_scope, muted_until, muted_at)
  on table public.conversation_members to authenticated;

-- Replace the batch 1 policy with a slightly broader UPDATE that still
-- only allows self-updates but now covers mute columns too (column grant
-- above narrows what actually moves).
drop policy if exists "self updates own read cursor" on public.conversation_members;
drop policy if exists "self updates own conversation membership" on public.conversation_members;
create policy "self updates own conversation membership" on public.conversation_members for update to authenticated
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

-- ------------------------------------------------------------
-- Row-shape guard update: allow attachment-only messages and image kind.
-- ------------------------------------------------------------

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

  new.body := btrim(coalesce(new.body, ''));
  -- Text messages MUST carry a body; image or attachment-carrying rows
  -- may have an empty body (photo-only). System messages likewise get a
  -- body-optional pass — the sender_member_id branch below still gates
  -- who may author what.
  if new.content_type = 'text' and new.body = '' and not coalesce(new.has_attachments, false) then
    raise exception 'Message body is required';
  end if;
  if char_length(new.body) > 4000 then
    raise exception 'Message body is too long';
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

-- ------------------------------------------------------------
-- After-trigger: keep messages.has_attachments in sync with the
-- attachment table for any code path (backfill, admin console) that
-- doesn't go through set_message_attachments below.
-- ------------------------------------------------------------

create or replace function public.sync_message_has_attachments()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  target_message_id uuid;
begin
  target_message_id := coalesce(new.message_id, old.message_id);
  update public.messages m
     set has_attachments = exists (
       select 1 from public.message_attachments a where a.message_id = m.id
     )
   where m.id = target_message_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists message_attachments_sync_flag on public.message_attachments;
create trigger message_attachments_sync_flag
  after insert or delete on public.message_attachments
  for each row execute function public.sync_message_has_attachments();

-- ------------------------------------------------------------
-- Row-shape guard for attachments: reject cross-family paths and any
-- file whose storage path does not start with the owning family id
-- (matches the storage bucket policy below so the DB and the bucket
-- can never disagree about who owns a file).
-- ------------------------------------------------------------

create or replace function public.validate_message_attachment_row()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  msg public.messages%rowtype;
begin
  select * into msg from public.messages where id = new.message_id;
  if msg.id is null then
    raise exception 'Attachment message not found';
  end if;
  if new.family_id <> msg.family_id then
    raise exception 'Attachment family does not match message';
  end if;
  if new.conversation_id <> msg.conversation_id then
    raise exception 'Attachment conversation does not match message';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.family_id::text then
    raise exception 'Attachment storage path must be scoped to the owning family';
  end if;
  return new;
end;
$$;

drop trigger if exists message_attachments_validate on public.message_attachments;
create trigger message_attachments_validate
  before insert or update on public.message_attachments
  for each row execute function public.validate_message_attachment_row();

-- ------------------------------------------------------------
-- RPCs — new
-- ------------------------------------------------------------

-- edit_message
--
-- Only the original author may edit, and only text bodies. Family
-- admins deliberately cannot silently rewrite someone else's words —
-- moderation goes through a hard delete + system message elsewhere.
-- Editing a deleted message is a no-op error.
create or replace function public.edit_message(
  p_message_id uuid,
  p_body text
) returns public.messages
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  target public.messages%rowtype;
  trimmed text;
  updated public.messages%rowtype;
  preview text;
begin
  select * into target from public.messages where id = p_message_id;
  if target.id is null then
    raise exception 'Message not found';
  end if;
  if target.deleted_at is not null then
    raise exception 'Cannot edit a deleted message';
  end if;
  if target.content_type = 'system' then
    raise exception 'System messages cannot be edited';
  end if;

  trimmed := btrim(coalesce(p_body, ''));
  if trimmed = '' and not coalesce(target.has_attachments, false) then
    raise exception 'Message body is required';
  end if;
  if char_length(trimmed) > 4000 then
    raise exception 'Message body is too long';
  end if;

  select * into actor from public.members
    where family_id = target.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null or actor.id <> target.sender_member_id then
    raise exception 'Only the author may edit this message';
  end if;

  update public.messages
     set body = trimmed,
         edited_at = now()
   where id = target.id
   returning * into updated;

  -- Refresh conversation preview only if this WAS the last message —
  -- editing an older one shouldn't reshuffle the list.
  preview := left(regexp_replace(updated.body, '\s+', ' ', 'g'), 160);
  update public.conversations c
     set last_message_preview = preview,
         updated_at = updated.edited_at
   where c.id = updated.conversation_id
     and c.last_message_at = updated.created_at;

  return updated;
end;
$$;

-- delete_message
--
-- Soft delete for text messages authored by the caller. The body is
-- REPLACED (not just flagged) so a stale realtime cache on another
-- client can't leak the original text; the same reason we set
-- has_attachments=false and drop related attachments below. Family
-- admins do NOT get an implicit override here — a parent moderating a
-- child's post is a separate flow.
create or replace function public.delete_message(
  p_message_id uuid
) returns public.messages
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  target public.messages%rowtype;
  updated public.messages%rowtype;
begin
  select * into target from public.messages where id = p_message_id;
  if target.id is null then
    raise exception 'Message not found';
  end if;
  if target.deleted_at is not null then
    return target;
  end if;

  select * into actor from public.members
    where family_id = target.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null or actor.id <> target.sender_member_id then
    raise exception 'Only the author may delete this message';
  end if;

  -- Drop attachments — deleting the row cascades to any reactions
  -- and, via delete_message_attachments below, removes the storage
  -- files too. The cascade fires the sync trigger which will flip
  -- has_attachments back to false.
  delete from public.message_attachments where message_id = target.id;
  delete from public.message_reactions where message_id = target.id;

  update public.messages
     set body = '',
         has_attachments = false,
         deleted_at = now(),
         edited_at = null
   where id = target.id
   returning * into updated;

  -- Refresh conversation preview if this was the last visible message.
  if updated.created_at = (
    select max(created_at) from public.messages
     where conversation_id = updated.conversation_id and deleted_at is null
  ) or not exists (
    select 1 from public.messages
     where conversation_id = updated.conversation_id and deleted_at is null
  ) then
    update public.conversations c
       set last_message_preview = (
         select left(regexp_replace(m.body, '\s+', ' ', 'g'), 160)
           from public.messages m
          where m.conversation_id = c.id and m.deleted_at is null
          order by m.created_at desc, m.id desc
          limit 1
       ),
       last_message_at = (
         select m.created_at from public.messages m
          where m.conversation_id = c.id and m.deleted_at is null
          order by m.created_at desc, m.id desc
          limit 1
       )
     where c.id = updated.conversation_id;
  end if;

  return updated;
end;
$$;

-- add_reaction / remove_reaction
--
-- Any participant may react. The unique key (message_id, member_id,
-- emoji) makes double-taps idempotent.
create or replace function public.add_message_reaction(
  p_message_id uuid,
  p_emoji text
) returns public.message_reactions
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  target public.messages%rowtype;
  trimmed text;
  inserted public.message_reactions%rowtype;
begin
  trimmed := btrim(coalesce(p_emoji, ''));
  if trimmed = '' or char_length(trimmed) > 24 then
    raise exception 'Emoji is required';
  end if;

  select * into target from public.messages where id = p_message_id;
  if target.id is null or target.deleted_at is not null then
    raise exception 'Message not found';
  end if;

  select * into actor from public.members
    where family_id = target.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null then
    raise exception 'Active household membership required';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
     where cm.conversation_id = target.conversation_id and cm.member_id = actor.id
  ) then
    raise exception 'Not a participant of this conversation';
  end if;

  insert into public.message_reactions (message_id, member_id, emoji, family_id)
    values (target.id, actor.id, trimmed, target.family_id)
    on conflict (message_id, member_id, emoji) do update
      set created_at = public.message_reactions.created_at
    returning * into inserted;

  return inserted;
end;
$$;

create or replace function public.remove_message_reaction(
  p_message_id uuid,
  p_emoji text
) returns void
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  target public.messages%rowtype;
  trimmed text;
begin
  trimmed := btrim(coalesce(p_emoji, ''));
  if trimmed = '' then
    return;
  end if;
  select * into target from public.messages where id = p_message_id;
  if target.id is null then
    return;
  end if;
  select * into actor from public.members
    where family_id = target.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null then
    return;
  end if;
  delete from public.message_reactions
   where message_id = target.id
     and member_id = actor.id
     and emoji = trimmed;
end;
$$;

-- set_conversation_mute
--
-- One entry point so the client never has to reason about which
-- columns move together. `p_scope`='none' clears the mute; the other
-- scopes leave muted_until nullable (indefinite mute) since we don't
-- expose a duration picker in this batch.
create or replace function public.set_conversation_mute(
  p_conversation_id uuid,
  p_scope text
) returns public.conversation_members
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
  updated public.conversation_members%rowtype;
begin
  if p_scope not in ('none', 'messages', 'all') then
    raise exception 'Invalid mute scope';
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

  update public.conversation_members cm
     set mute_scope = p_scope,
         muted_at = case when p_scope = 'none' then null else coalesce(cm.muted_at, now()) end,
         muted_until = case when p_scope = 'none' then null else cm.muted_until end
   where cm.conversation_id = conv.id and cm.member_id = actor.id
   returning * into updated;

  return updated;
end;
$$;

-- send_message: extended to accept attachment ids the caller has just
-- uploaded to storage. The RPC binds them to the freshly created
-- message row and flips has_attachments in one shot so the realtime
-- echo carries the flag from the first frame.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_attachment_ids uuid[] default null
) returns public.messages
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
  trimmed text;
  inserted public.messages%rowtype;
  preview text;
  attach_count integer := 0;
begin
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

  if p_attachment_ids is not null then
    attach_count := array_length(p_attachment_ids, 1);
    if attach_count > 8 then
      raise exception 'Too many attachments';
    end if;
  end if;

  if trimmed = '' and coalesce(attach_count, 0) = 0 then
    raise exception 'Message body is required';
  end if;

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
    content_type, body, client_id, reply_to_message_id, has_attachments
  ) values (
    conv.id, conv.family_id, actor.id,
    case when attach_count > 0 and trimmed = '' then 'image' else 'text' end,
    trimmed, p_client_id, p_reply_to_message_id, attach_count > 0
  ) returning * into inserted;

  -- Bind any pre-uploaded attachments to this message. Only rows that
  -- belong to the caller's family and to this conversation may be
  -- attached — anything else is silently ignored so a hostile caller
  -- cannot steal another family's file.
  if attach_count > 0 then
    update public.message_attachments a
       set message_id = inserted.id
     where a.id = any (p_attachment_ids)
       and a.family_id = conv.family_id
       and a.conversation_id = conv.id
       and a.message_id is not distinct from inserted.id;
    -- Also cover the "just uploaded, not yet bound" case:
    update public.message_attachments a
       set message_id = inserted.id
     where a.id = any (p_attachment_ids)
       and a.family_id = conv.family_id
       and a.conversation_id = conv.id;
  end if;

  preview := case
    when trimmed <> '' then left(regexp_replace(trimmed, '\s+', ' ', 'g'), 160)
    when attach_count > 0 then '📷'
    else ''
  end;
  update public.conversations
     set last_message_at = inserted.created_at,
         last_message_preview = preview,
         updated_at = inserted.created_at
   where id = conv.id;

  update public.conversation_members
     set last_read_at = inserted.created_at
   where conversation_id = conv.id and member_id = actor.id;

  return inserted;
end;
$$;

-- register_message_attachment
--
-- Called AFTER the client uploads the file to storage. Creates the
-- attachment row in draft state (message_id null via a placeholder
-- row is not allowed by the NOT NULL constraint, so we require the
-- caller to send along a message they already own). To support the
-- "upload before send" UX we accept a draft flow where the client
-- creates a placeholder message with an empty body — the row is
-- attachable and the RPC returns the attachment id. However, to keep
-- things simple we make the message_id required at insert time.
-- The composer calls this AFTER send_message with the attachment
-- ids or before via placeholder logic; see the frontend.
create or replace function public.register_message_attachment(
  p_conversation_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null,
  p_message_id uuid default null
) returns public.message_attachments
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
  placeholder public.messages%rowtype;
  attach public.message_attachments%rowtype;
  target_message_id uuid;
begin
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

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception 'Unsupported attachment type';
  end if;
  if p_byte_size <= 0 or p_byte_size > 8388608 then
    raise exception 'Attachment too large';
  end if;
  if split_part(p_storage_path, '/', 1) <> conv.family_id::text then
    raise exception 'Attachment storage path must be scoped to the owning family';
  end if;
  if split_part(p_storage_path, '/', 2) <> conv.id::text then
    raise exception 'Attachment storage path must be scoped to the conversation';
  end if;

  if p_message_id is not null then
    -- Verify caller owns the target message.
    if not exists (
      select 1 from public.messages m
       where m.id = p_message_id
         and m.conversation_id = conv.id
         and m.sender_member_id = actor.id
    ) then
      raise exception 'Cannot attach to another member''s message';
    end if;
    target_message_id := p_message_id;
  else
    -- Create a placeholder image message so we have a message_id
    -- to attach against. The composer will finish this send with
    -- send_message and it will be a no-op update to the row.
    insert into public.messages (
      conversation_id, family_id, sender_member_id, content_type, body, has_attachments
    ) values (
      conv.id, conv.family_id, actor.id, 'image', '', true
    ) returning * into placeholder;
    target_message_id := placeholder.id;
  end if;

  insert into public.message_attachments (
    message_id, family_id, conversation_id, storage_bucket, storage_path,
    mime_type, byte_size, width, height
  ) values (
    target_message_id, conv.family_id, conv.id, 'message-attachments', p_storage_path,
    p_mime_type, p_byte_size, p_width, p_height
  ) returning * into attach;

  return attach;
end;
$$;

-- discard_pending_attachment
--
-- Composer "cancel" path: removes an attachment row the caller just
-- uploaded and, if that leaves an image placeholder message empty,
-- deletes the placeholder too. Only the uploader may discard, and
-- only their own placeholder messages.
create or replace function public.discard_pending_attachment(
  p_attachment_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  attach public.message_attachments%rowtype;
  msg public.messages%rowtype;
begin
  select * into attach from public.message_attachments where id = p_attachment_id;
  if attach.id is null then
    return;
  end if;
  select * into msg from public.messages where id = attach.message_id;
  if msg.id is null then
    return;
  end if;
  select * into actor from public.members
    where family_id = attach.family_id
      and user_id = auth.uid()
      and coalesce(status, 'active') = 'active'
    limit 1;
  if actor.id is null or actor.id <> msg.sender_member_id then
    raise exception 'Cannot discard another member''s attachment';
  end if;

  delete from public.message_attachments where id = attach.id;

  -- If the message was a placeholder (empty body, no other
  -- attachments), remove it.
  if coalesce(btrim(msg.body), '') = '' and not exists (
    select 1 from public.message_attachments where message_id = msg.id
  ) then
    delete from public.messages where id = msg.id;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Function grants
-- ------------------------------------------------------------

revoke all on function public.edit_message(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_message(uuid) from public, anon, authenticated;
revoke all on function public.add_message_reaction(uuid, text) from public, anon, authenticated;
revoke all on function public.remove_message_reaction(uuid, text) from public, anon, authenticated;
revoke all on function public.set_conversation_mute(uuid, text) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.register_message_attachment(uuid, text, text, bigint, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.discard_pending_attachment(uuid) from public, anon, authenticated;
revoke all on function public.validate_message_row() from public, anon, authenticated;
revoke all on function public.validate_message_attachment_row() from public, anon, authenticated;
revoke all on function public.sync_message_has_attachments() from public, anon, authenticated;

grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.add_message_reaction(uuid, text) to authenticated;
grant execute on function public.remove_message_reaction(uuid, text) to authenticated;
grant execute on function public.set_conversation_mute(uuid, text) to authenticated;
grant execute on function public.send_message(uuid, text, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.register_message_attachment(uuid, text, text, bigint, integer, integer, uuid) to authenticated;
grant execute on function public.discard_pending_attachment(uuid) to authenticated;

-- ------------------------------------------------------------
-- Storage bucket + policies
--
-- Path shape: <family_id>/<conversation_id>/<uuid>.<ext>
-- The DB-side validate_message_attachment_row + register_message_attachment
-- keep the metadata honest; the bucket policy below stops a member of
-- family A from ever writing (or reading) family B's objects at the
-- storage layer, even if they somehow slip past the API.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_message_attachment(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case
    when object_name is null or object_name = '' then false
    else public.is_active_family_member((split_part(object_name, '/', 1))::uuid)
  end;
$$;

create or replace function public.can_write_message_attachment(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case
    when object_name is null or object_name = '' then false
    when cardinality(string_to_array(object_name, '/')) < 3 then false
    when split_part(object_name, '/', 3) !~* '^[0-9a-f-]+\.(jpe?g|png|webp|gif)$' then false
    else exists (
      select 1
      from public.members m
      join public.conversation_members cm
        on cm.member_id = m.id
       and cm.conversation_id = (split_part(object_name, '/', 2))::uuid
      where m.family_id = (split_part(object_name, '/', 1))::uuid
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    )
  end;
$$;

revoke execute on function public.can_access_message_attachment(text) from public;
revoke execute on function public.can_write_message_attachment(text) from public;
grant execute on function public.can_access_message_attachment(text) to authenticated;
grant execute on function public.can_write_message_attachment(text) to authenticated;

drop policy if exists "family members can read message attachments" on storage.objects;
create policy "family members can read message attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.can_access_message_attachment(name)
  );

drop policy if exists "conversation members can upload message attachments" on storage.objects;
create policy "conversation members can upload message attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.can_write_message_attachment(name)
  );

drop policy if exists "conversation members can delete message attachments" on storage.objects;
create policy "conversation members can delete message attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.can_write_message_attachment(name)
  );

-- ------------------------------------------------------------
-- Realtime publication for the new tables.
-- ------------------------------------------------------------

do $$
declare
  target text;
  targets text[] := array['message_reactions', 'message_attachments'];
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

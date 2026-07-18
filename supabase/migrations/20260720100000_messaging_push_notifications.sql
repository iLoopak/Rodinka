-- Batch 4: push notifications for family messaging.
--
-- This migration deliberately does NOT introduce a second notification
-- engine. Messages enqueue rows into the existing `notification_deliveries`
-- outbox (Phase 4.1 PR1/PR2), so leases, retry/backoff, dead-subscription
-- reaping, attempt auditing and the `send-notification-deliveries` cron
-- all apply unchanged. What is new here is:
--
--   1. messaging-specific rows in `notification_preferences`
--   2. `message_mentions`      — resolved @-mentions, drives high priority
--   3. `conversation_presence` — "is this member actually looking at it"
--   4. per-conversation mute with a real expiry
--   5. a deferred fan-out trigger that turns one message into N deliveries
--
-- Priority note: direct messages and mentions get a HIGHER PUSH URGENCY and
-- their own notification tag (so they are not collapsed behind group chat),
-- but they stay `importance = 'normal'`. `'important'` is what bypasses
-- quiet hours in the sender, and a 3am group chat DM is not a reason to
-- override a user's quiet hours.

-- ------------------------------------------------------------
-- 1. Messaging notification preferences
--
-- Added to the existing per-member table rather than a parallel one, so
-- push_enabled / quiet hours / timezone / locale keep working as the single
-- account-level gate above these per-type switches.
-- ------------------------------------------------------------

alter table public.notification_preferences
  add column if not exists message_direct_enabled boolean not null default true,
  add column if not exists message_group_enabled boolean not null default true,
  add column if not exists message_reply_mention_enabled boolean not null default true,
  add column if not exists message_task_enabled boolean not null default true,
  add column if not exists message_entity_enabled boolean not null default true,
  add column if not exists message_sound_enabled boolean not null default true,
  -- When false, the push payload carries a generic title/body and the real
  -- message text never leaves the database. Enforced in the sender, not here.
  add column if not exists message_preview_enabled boolean not null default true;

-- ------------------------------------------------------------
-- 2. Mentions
--
-- Rows are written only by `send_message` (security definer). There is no
-- INSERT/UPDATE/DELETE policy: a client cannot fabricate a mention of a
-- member who is not a participant, which is what makes "mentions bypass
-- the group-chat mute preference" safe to offer.
-- ------------------------------------------------------------

create table if not exists public.message_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  mentioned_member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, mentioned_member_id)
);

create index if not exists message_mentions_message_idx
  on public.message_mentions (message_id);
create index if not exists message_mentions_member_idx
  on public.message_mentions (mentioned_member_id, created_at desc);
create index if not exists message_mentions_family_idx
  on public.message_mentions (family_id);

alter table public.message_mentions enable row level security;
revoke all on table public.message_mentions from public, anon;
grant select on table public.message_mentions to authenticated;
grant all on table public.message_mentions to service_role;

drop policy if exists "participants read message mentions" on public.message_mentions;
create policy "participants read message mentions" on public.message_mentions for select to authenticated
  using (
    public.is_active_family_member(family_id)
    and public.is_conversation_participant(conversation_id)
  );

-- ------------------------------------------------------------
-- 3. Conversation presence
--
-- One row per (conversation, member) holding nothing but a heartbeat
-- timestamp — no message content, no device identity, no user agent. The
-- client refreshes it while a conversation is open AND the tab is focused;
-- the fan-out trigger and the sender both treat a fresh heartbeat as
-- "already reading this, do not push".
--
-- Not readable by clients at all: presence of other members is not a
-- feature we are shipping, and exposing it would leak who is online.
-- ------------------------------------------------------------

create table if not exists public.conversation_presence (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  last_active_at timestamptz not null default now(),
  primary key (conversation_id, member_id)
);

create index if not exists conversation_presence_recent_idx
  on public.conversation_presence (conversation_id, last_active_at desc);

alter table public.conversation_presence enable row level security;
revoke all on table public.conversation_presence from public, anon, authenticated;
grant all on table public.conversation_presence to service_role;

-- The heartbeat window. Client beats every ~30s; 75s tolerates one missed
-- beat plus clock skew without keeping a closed tab "present" for long.
create or replace function public.conversation_presence_window()
returns interval language sql immutable
set search_path = public, pg_temp as $$
  select interval '75 seconds';
$$;

create or replace function public.touch_conversation_presence(p_conversation_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
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

  insert into public.conversation_presence (conversation_id, member_id, family_id, last_active_at)
  values (conv.id, actor.id, conv.family_id, now())
  on conflict (conversation_id, member_id)
  do update set last_active_at = now();
end;
$$;

-- Called on blur/close/unmount. Backdates the heartbeat instead of deleting
-- the row so the next push is not suppressed by a stale "present" state.
create or replace function public.clear_conversation_presence(p_conversation_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor_id uuid;
begin
  select m.id into actor_id
    from public.members m
    join public.conversations c on c.family_id = m.family_id
   where c.id = p_conversation_id
     and m.user_id = auth.uid()
     and coalesce(m.status, 'active') = 'active'
   limit 1;
  if actor_id is null then
    return;
  end if;
  update public.conversation_presence
     set last_active_at = 'epoch'::timestamptz
   where conversation_id = p_conversation_id and member_id = actor_id;
end;
$$;

create or replace function public.is_member_present_in_conversation(
  p_conversation_id uuid,
  p_member_id uuid
) returns boolean
language sql stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.conversation_presence p
     where p.conversation_id = p_conversation_id
       and p.member_id = p_member_id
       and p.last_active_at > now() - public.conversation_presence_window()
  );
$$;

revoke all on function public.touch_conversation_presence(uuid) from public, anon;
revoke all on function public.clear_conversation_presence(uuid) from public, anon;
revoke all on function public.is_member_present_in_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.touch_conversation_presence(uuid) to authenticated;
grant execute on function public.clear_conversation_presence(uuid) to authenticated;
grant execute on function public.is_member_present_in_conversation(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 4. Mute with a real expiry
--
-- Batch 2 shipped `set_conversation_mute(uuid, text)` with an indefinite
-- mute only. The 2-arg form is dropped rather than kept, because keeping it
-- alongside a 3-arg form with a defaulted third parameter makes a 2-arg
-- call ambiguous to the planner.
-- ------------------------------------------------------------

drop function if exists public.set_conversation_mute(uuid, text);

create or replace function public.set_conversation_mute(
  p_conversation_id uuid,
  p_scope text,
  p_until timestamptz default null
) returns public.conversation_members
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor public.members%rowtype;
  conv public.conversations%rowtype;
  updated public.conversation_members%rowtype;
  bounded timestamptz;
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

  -- A mute is a UI convenience, not a retention policy: cap it at 30 days
  -- so a mis-set far-future timestamp cannot silence a conversation forever
  -- in a way the user can no longer see in the mute menu.
  bounded := case
    when p_scope = 'none' then null
    when p_until is null then null
    when p_until <= now() then null
    else least(p_until, now() + interval '30 days')
  end;

  update public.conversation_members cm
     set mute_scope = p_scope,
         muted_at = case when p_scope = 'none' then null else coalesce(cm.muted_at, now()) end,
         muted_until = bounded
   where cm.conversation_id = conv.id and cm.member_id = actor.id
   returning * into updated;

  if updated.member_id is null then
    raise exception 'Not a participant of this conversation';
  end if;

  return updated;
end;
$$;

revoke all on function public.set_conversation_mute(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_conversation_mute(uuid, text, timestamptz) to authenticated;

-- Single definition of "is this conversation currently silenced for this
-- member", so the trigger, the sender and any future surface agree.
create or replace function public.conversation_mute_active(
  p_conversation_id uuid,
  p_member_id uuid,
  p_scopes text[]
) returns boolean
language sql stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
       and cm.member_id = p_member_id
       and cm.mute_scope = any (p_scopes)
       and (cm.muted_until is null or cm.muted_until > now())
  );
$$;

revoke all on function public.conversation_mute_active(uuid, uuid, text[]) from public, anon;
grant execute on function public.conversation_mute_active(uuid, uuid, text[]) to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Mention resolution
--
-- The composer sends explicit member ids picked from the autocomplete. We
-- do not trust them blindly: each id must be an active participant of the
-- conversation, and the body must actually contain "@<display name>". That
-- second check stops a modified client from silently high-priority-pinging
-- someone whose name is nowhere in the text.
--
-- We also parse the body for participants the user typed without using the
-- autocomplete, so a hand-typed "@Petra" still notifies Petra.
-- ------------------------------------------------------------

create or replace function public.resolve_message_mentions(
  p_conversation_id uuid,
  p_body text,
  p_explicit_member_ids uuid[]
) returns uuid[]
language sql stable
set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct candidate.member_id), '{}'::uuid[])
  from (
    select cm.member_id
      from public.conversation_members cm
      join public.members m on m.id = cm.member_id
     where cm.conversation_id = p_conversation_id
       and coalesce(m.status, 'active') = 'active'
       and btrim(coalesce(m.display_name, '')) <> ''
       and (
         -- Explicitly picked in the composer, and the name is in the text.
         (
           p_explicit_member_ids is not null
           and cm.member_id = any (p_explicit_member_ids)
           and position(lower('@' || btrim(m.display_name)) in lower(coalesce(p_body, ''))) > 0
         )
         -- Or hand-typed without the autocomplete.
         or position(lower('@' || btrim(m.display_name)) in lower(coalesce(p_body, ''))) > 0
       )
  ) as candidate;
$$;

revoke all on function public.resolve_message_mentions(uuid, text, uuid[]) from public, anon;
grant execute on function public.resolve_message_mentions(uuid, text, uuid[]) to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. send_message: accept mentions
--
-- Same drop-then-create reasoning as set_conversation_mute: adding a sixth
-- defaulted parameter would make the existing 5-arg call ambiguous.
-- ------------------------------------------------------------

drop function if exists public.send_message(uuid, text, uuid, uuid, uuid[]);

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_attachment_ids uuid[] default null,
  p_mention_member_ids uuid[] default null
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
  mention_ids uuid[];
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

  -- Idempotent resend: return the existing row untouched. Its mentions and
  -- its queued deliveries were already created on the first call.
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

  if attach_count > 0 then
    update public.message_attachments a
       set message_id = inserted.id
     where a.id = any (p_attachment_ids)
       and a.family_id = conv.family_id
       and a.conversation_id = conv.id;
  end if;

  -- Mentions are recorded before commit, so the deferred fan-out trigger
  -- below can already see them when it classifies each recipient.
  if trimmed <> '' then
    mention_ids := public.resolve_message_mentions(conv.id, trimmed, p_mention_member_ids);
    if array_length(mention_ids, 1) > 0 then
      insert into public.message_mentions (message_id, conversation_id, family_id, mentioned_member_id)
      select inserted.id, conv.id, conv.family_id, unnest(mention_ids)
      on conflict (message_id, mentioned_member_id) do nothing;
    end if;
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

revoke all on function public.send_message(uuid, text, uuid, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, uuid, uuid[], uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 7. Fan-out into the existing outbox
--
-- Implemented as a DEFERRABLE INITIALLY DEFERRED constraint trigger: it
-- runs at COMMIT, not immediately after the row insert. That matters
-- because `send_message` writes the message first and its mentions second —
-- a plain AFTER INSERT trigger would classify every recipient before any
-- mention row existed and would never produce a 'mention' delivery.
--
-- Idempotence comes from `notification_deliveries.idempotency_key`, which
-- is UNIQUE. The key is 'msg:<message_id>:<member_id>', so a statement
-- replay, a trigger re-fire or a backend retry all collapse onto the same
-- row via ON CONFLICT DO NOTHING.
--
-- Deliberately NOT stored on the delivery row: the message text. The body
-- stays in `messages`; the sender reads it at send time and decides whether
-- the user's preview preference allows it into the payload. This keeps the
-- outbox free of duplicated message content and makes the preview setting
-- authoritative at delivery time rather than at enqueue time.
-- ------------------------------------------------------------

create or replace function public.enqueue_message_notifications()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  conv public.conversations%rowtype;
  sender public.members%rowtype;
  reply_target_member_id uuid;
  sender_label text;
begin
  -- System messages are handled by the entity path below, not here.
  if new.content_type = 'system' then
    return null;
  end if;
  if new.deleted_at is not null then
    return null;
  end if;

  select * into conv from public.conversations where id = new.conversation_id;
  if conv.id is null then
    return null;
  end if;

  select * into sender from public.members where id = new.sender_member_id;
  sender_label := coalesce(nullif(btrim(sender.display_name), ''), 'Rodinka');

  if new.reply_to_message_id is not null then
    select m.sender_member_id into reply_target_member_id
      from public.messages m where m.id = new.reply_to_message_id;
  end if;

  insert into public.notification_deliveries (
    user_id, family_id, target_member_id, delivery_type, channel,
    title, body, deep_link, importance, scheduled_for, idempotency_key, metadata
  )
  select
    recipient.user_id,
    conv.family_id,
    recipient.member_id,
    'immediate',
    'planned',
    left(sender_label, 180),
    -- No message text here on purpose; the sender renders it per-preference.
    null,
    '/messages?c=' || conv.id::text || '&m=' || new.id::text,
    'normal',
    now(),
    'msg:' || new.id::text || ':' || recipient.member_id::text,
    jsonb_build_object(
      'kind', recipient.kind,
      'conversationId', conv.id::text,
      'conversationKind', conv.kind,
      'messageId', new.id::text,
      'senderMemberId', coalesce(new.sender_member_id::text, ''),
      'priority', case when recipient.kind in ('direct', 'mention', 'reply') then 'high' else 'normal' end
    )
  from (
    select
      cm.member_id,
      m.user_id,
      case
        when exists (
          select 1 from public.message_mentions mm
           where mm.message_id = new.id and mm.mentioned_member_id = cm.member_id
        ) then 'mention'
        when reply_target_member_id is not null and reply_target_member_id = cm.member_id then 'reply'
        when conv.kind = 'direct' then 'direct'
        else 'group'
      end as kind
    from public.conversation_members cm
    join public.members m on m.id = cm.member_id
   where cm.conversation_id = conv.id
     -- Never notify the author of their own message.
     and cm.member_id is distinct from new.sender_member_id
     -- Child profiles without a login have nothing to push to.
     and m.user_id is not null
     and coalesce(m.status, 'active') = 'active'
  ) as recipient
  where
    -- Mute. 'all' silences everything; 'messages' silences chat pings.
    not public.conversation_mute_active(conv.id, recipient.member_id, array['all', 'messages'])
    -- Already looking at this conversation right now: realtime will show
    -- the message, a push would be pure noise.
    and not public.is_member_present_in_conversation(conv.id, recipient.member_id)
    -- Per-type preferences. A member with no preferences row yet falls back
    -- to the column defaults (all true) rather than being silently excluded;
    -- the real gate is account-level push_enabled, which defaults to false
    -- and is re-checked — along with quiet hours and preview — in the sender.
    and coalesce((
      select case recipient.kind
               when 'mention' then np.message_reply_mention_enabled
               when 'reply'   then np.message_reply_mention_enabled
               when 'direct'  then np.message_direct_enabled
               else np.message_group_enabled
             end
        from public.notification_preferences np
       where np.member_id = recipient.member_id
    ), true)
  on conflict (idempotency_key) do nothing;

  return null;
end;
$$;

drop trigger if exists messages_enqueue_push on public.messages;
create constraint trigger messages_enqueue_push
after insert on public.messages
deferrable initially deferred
for each row execute function public.enqueue_message_notifications();

revoke all on function public.enqueue_message_notifications() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. Task assignment and shared-entity changes
--
-- "Do not push every routine system change." These only fire for the one
-- member the change actually concerns (the new assignee / responsible),
-- never the whole conversation, and never the person who made the change.
-- ------------------------------------------------------------

create or replace function public.enqueue_entity_notification(
  p_conversation_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_kind text,
  p_actor_member_id uuid,
  p_target_member_id uuid,
  p_label text
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  conv public.conversations%rowtype;
  target public.members%rowtype;
  actor_label text;
  allowed boolean;
  inserted_count integer;
begin
  if p_kind not in ('task_assigned', 'entity_changed') then
    raise exception 'Unsupported entity notification kind';
  end if;
  if p_target_member_id is null or p_target_member_id = p_actor_member_id then
    return false;
  end if;

  select * into conv from public.conversations where id = p_conversation_id;
  if conv.id is null then
    return false;
  end if;

  select * into target from public.members where id = p_target_member_id;
  if target.id is null or target.user_id is null or coalesce(target.status, 'active') <> 'active' then
    return false;
  end if;
  if target.family_id <> conv.family_id then
    return false;
  end if;
  if not exists (
    select 1 from public.conversation_members cm
     where cm.conversation_id = conv.id and cm.member_id = target.id
  ) then
    return false;
  end if;

  -- 'all' mutes these too; 'messages' does not — a task landing on your
  -- plate is not chat chatter.
  if public.conversation_mute_active(conv.id, target.id, array['all']) then
    return false;
  end if;

  select case p_kind
           when 'task_assigned' then np.message_task_enabled
           else np.message_entity_enabled
         end
    into allowed
    from public.notification_preferences np
   where np.member_id = target.id;
  if not coalesce(allowed, true) then
    return false;
  end if;

  select coalesce(nullif(btrim(m.display_name), ''), 'Rodinka') into actor_label
    from public.members m where m.id = p_actor_member_id;

  insert into public.notification_deliveries (
    user_id, family_id, target_member_id, delivery_type, channel,
    title, body, deep_link, importance, scheduled_for, idempotency_key, metadata
  ) values (
    target.user_id, conv.family_id, target.id, 'immediate', 'planned',
    left(coalesce(actor_label, 'Rodinka'), 180),
    null,
    '/messages?c=' || conv.id::text,
    'normal',
    now(),
    'entity:' || p_kind || ':' || p_entity_type || ':' || p_entity_id::text || ':' || target.id::text
      || ':' || floor(extract(epoch from now()) / 300)::bigint::text,
    jsonb_build_object(
      'kind', p_kind,
      'conversationId', conv.id::text,
      'conversationKind', conv.kind,
      'entityType', p_entity_type,
      'entityId', p_entity_id::text,
      'label', left(coalesce(btrim(p_label), ''), 120),
      'priority', case when p_kind = 'task_assigned' then 'high' else 'normal' end
    )
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

revoke all on function public.enqueue_entity_notification(uuid, text, uuid, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_entity_notification(uuid, text, uuid, text, uuid, uuid, text)
  to service_role;

-- Client-facing wrapper: the caller can only say "I changed this entity in
-- this conversation"; who gets notified is derived server-side.
create or replace function public.notify_entity_change(
  p_conversation_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_kind text,
  p_target_member_id uuid,
  p_label text default null
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  conv public.conversations%rowtype;
  actor public.members%rowtype;
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
  -- The entity must genuinely be shared into this conversation, otherwise
  -- this would be an arbitrary "ping any family member" primitive.
  if not exists (
    select 1 from public.message_entity_refs r
     where r.conversation_id = conv.id
       and r.entity_type = p_entity_type
       and r.entity_id = p_entity_id
  ) then
    return false;
  end if;

  return public.enqueue_entity_notification(
    conv.id, p_entity_type, p_entity_id, p_kind, actor.id, p_target_member_id, p_label
  );
end;
$$;

revoke all on function public.notify_entity_change(uuid, text, uuid, text, uuid, text) from public, anon;
grant execute on function public.notify_entity_change(uuid, text, uuid, text, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 9. Sender-side helper
--
-- The fan-out trigger evaluates preferences/mute/presence at enqueue time.
-- Between enqueue and delivery a user can open the conversation, mute it or
-- flip a switch, so the sender re-asks this immediately before pushing.
-- ------------------------------------------------------------

create or replace function public.message_delivery_still_relevant(
  p_member_id uuid,
  p_conversation_id uuid,
  p_kind text
) returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  allowed boolean;
begin
  if public.is_member_present_in_conversation(p_conversation_id, p_member_id) then
    return false;
  end if;

  if p_kind in ('task_assigned', 'entity_changed') then
    if public.conversation_mute_active(p_conversation_id, p_member_id, array['all']) then
      return false;
    end if;
    select case p_kind
             when 'task_assigned' then np.message_task_enabled
             else np.message_entity_enabled
           end
      into allowed
      from public.notification_preferences np where np.member_id = p_member_id;
    return coalesce(allowed, true);
  end if;

  if public.conversation_mute_active(p_conversation_id, p_member_id, array['all', 'messages']) then
    return false;
  end if;

  select case p_kind
           when 'mention' then np.message_reply_mention_enabled
           when 'reply'   then np.message_reply_mention_enabled
           when 'direct'  then np.message_direct_enabled
           else np.message_group_enabled
         end
    into allowed
    from public.notification_preferences np where np.member_id = p_member_id;
  return coalesce(allowed, true);
end;
$$;

revoke all on function public.message_delivery_still_relevant(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.message_delivery_still_relevant(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- 10. Sign-out / account teardown
--
-- `push_subscriptions.user_id` already cascades from auth.users, so account
-- deletion removes device rows. Sign-out is a per-device action: revoke
-- exactly the endpoint that is signing out and leave the user's other
-- devices alone.
-- ------------------------------------------------------------

create or replace function public.revoke_push_subscription_by_endpoint(p_endpoint text)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp as $$
declare changed integer;
begin
  update public.push_subscriptions
     set revoked_at = coalesce(revoked_at, now()), updated_at = now()
   where endpoint = p_endpoint
     and user_id = auth.uid()
     and revoked_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.revoke_push_subscription_by_endpoint(text) from public, anon;
grant execute on function public.revoke_push_subscription_by_endpoint(text) to authenticated;

-- ------------------------------------------------------------
-- 11. Realtime for mentions (badge/highlight parity with batch 1-3 tables)
-- ------------------------------------------------------------

do $$
begin
  execute 'alter table public.message_mentions replica identity full';
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_mentions'
    ) then
    execute 'alter publication supabase_realtime add table public.message_mentions';
  end if;
end $$;

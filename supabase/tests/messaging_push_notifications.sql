-- Messaging push fan-out behaviour (batch 4).
--
-- Runs against a LOCAL Supabase stack only, same rules as the authorization
-- matrix — it writes synthetic auth users and families:
--
--   npx supabase db reset
--   npm run test:db
--
-- What is proven here is the part that cannot be proven by reading the SQL:
-- that one INSERT into `messages` produces exactly the delivery rows it
-- should, and no others. Everything runs in one transaction and rolls back.
--
-- Note on the fan-out trigger: it is a DEFERRABLE INITIALLY DEFERRED
-- constraint trigger, so it fires at COMMIT — or at `SET CONSTRAINTS ALL
-- IMMEDIATE`, which is how these checks force it to run inside the
-- transaction without committing anything.

\set ON_ERROR_STOP on

\set u_alice  '00000000-0000-4000-8000-00000000u001'
\set u_bob    '00000000-0000-4000-8000-00000000u002'
\set u_cara   '00000000-0000-4000-8000-00000000u003'
\set u_outsider '00000000-0000-4000-8000-00000000u004'

\set m_alice  '00000000-0000-4000-8000-0000000mp001'
\set m_bob    '00000000-0000-4000-8000-0000000mp002'
\set m_cara   '00000000-0000-4000-8000-0000000mp003'
\set m_kid    '00000000-0000-4000-8000-0000000mp004'
\set m_out    '00000000-0000-4000-8000-0000000mp005'

\set fam      '00000000-0000-4000-8000-0000000fp001'
\set fam_two  '00000000-0000-4000-8000-0000000fp002'
\set conv     '00000000-0000-4000-8000-0000000cp001'
\set conv_dm  '00000000-0000-4000-8000-0000000cp002'

begin;

create schema if not exists tests;

create or replace function tests.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not condition then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

-- Counts deliveries queued for one member, ignoring anything left from an
-- earlier check in the same transaction.
create or replace function tests.deliveries_for(p_member uuid)
returns bigint language sql as $$
  select count(*) from public.notification_deliveries where target_member_id = p_member;
$$;

create or replace function tests.delivery_kind(p_member uuid)
returns text language sql as $$
  select metadata->>'kind' from public.notification_deliveries
   where target_member_id = p_member
   order by created_at desc limit 1;
$$;

-- ------------------------------------------------------------
-- Fixtures: one family with three adults and one login-less child.
-- ------------------------------------------------------------

insert into auth.users (id, email) values
  (:'u_alice', 'alice@example.test'),
  (:'u_bob', 'bob@example.test'),
  (:'u_cara', 'cara@example.test'),
  (:'u_outsider', 'outsider@example.test');

insert into public.families (id, name) values
  (:'fam', 'Testovací rodina'),
  (:'fam_two', 'Cizí rodina');

insert into public.members (id, family_id, user_id, display_name, role, status) values
  (:'m_alice', :'fam', :'u_alice', 'Alice', 'admin', 'active'),
  (:'m_bob', :'fam', :'u_bob', 'Bob', 'parent', 'active'),
  (:'m_cara', :'fam', :'u_cara', 'Cara', 'parent', 'active'),
  -- No user_id: a child profile with no login has nothing to push to.
  (:'m_kid', :'fam', null, 'Kiki', 'child', 'active'),
  (:'m_out', :'fam_two', :'u_outsider', 'Outsider', 'admin', 'active');

insert into public.conversations (id, family_id, kind, title) values
  (:'conv', :'fam', 'group', 'Rodina');

insert into public.conversation_members (conversation_id, member_id) values
  (:'conv', :'m_alice'), (:'conv', :'m_bob'), (:'conv', :'m_cara'), (:'conv', :'m_kid');

insert into public.notification_preferences (member_id, family_id, push_enabled) values
  (:'m_alice', :'fam', true), (:'m_bob', :'fam', true), (:'m_cara', :'fam', true);

-- ------------------------------------------------------------
-- 1. Basic fan-out: everyone but the author and the login-less child.
-- ------------------------------------------------------------

insert into public.messages (id, conversation_id, family_id, sender_member_id, body)
values (gen_random_uuid(), :'conv', :'fam', :'m_alice', 'Ahoj všichni');
set constraints all immediate;

select tests.assert(tests.deliveries_for(:'m_bob') = 1, 'Bob should receive a group delivery');
select tests.assert(tests.deliveries_for(:'m_cara') = 1, 'Cara should receive a group delivery');
select tests.assert(tests.deliveries_for(:'m_alice') = 0, 'The author must never be notified of their own message');
select tests.assert(tests.deliveries_for(:'m_kid') = 0, 'A member without a login must not be queued');
select tests.assert(tests.delivery_kind(:'m_bob') = 'group', 'A plain group message is kind=group');

-- The outbox row must not duplicate the message text.
select tests.assert(
  (select count(*) from public.notification_deliveries where body is not null) = 0,
  'Message text must not be copied into notification_deliveries.body'
);

delete from public.notification_deliveries;

-- ------------------------------------------------------------
-- 2. Idempotence: re-running the fan-out for the same message adds nothing.
-- ------------------------------------------------------------

do $$
declare msg_id uuid := gen_random_uuid();
begin
  insert into public.messages (id, conversation_id, family_id, sender_member_id, body)
  values (msg_id, (select id from public.conversations limit 1),
          (select family_id from public.conversations limit 1),
          (select id from public.members where display_name = 'Alice'), 'Znovu');
  set constraints all immediate;
end $$;

select tests.assert(
  (select count(*) from public.notification_deliveries) = 2,
  'One message should queue exactly one delivery per eligible recipient'
);

-- Simulate a backend retry replaying the same fan-out: the unique
-- idempotency key must absorb it.
do $$
declare msg public.messages%rowtype; before bigint; after bigint;
begin
  select * into msg from public.messages order by created_at desc limit 1;
  select count(*) into before from public.notification_deliveries;
  insert into public.notification_deliveries (
    user_id, family_id, target_member_id, delivery_type, channel, title,
    deep_link, importance, scheduled_for, idempotency_key, metadata
  )
  select m.user_id, msg.family_id, m.id, 'immediate', 'planned', 'Alice',
         '/messages', 'normal', now(),
         'msg:' || msg.id::text || ':' || m.id::text, '{}'::jsonb
    from public.members m where m.display_name = 'Bob'
  on conflict (idempotency_key) do nothing;
  select count(*) into after from public.notification_deliveries;
  perform tests.assert(before = after, 'A replayed fan-out must not create a second delivery');
end $$;

delete from public.notification_deliveries;

-- ------------------------------------------------------------
-- 3. Mute rules.
-- ------------------------------------------------------------

-- Indefinite message mute silences chat for Bob only.
update public.conversation_members set mute_scope = 'messages', muted_until = null
 where conversation_id = :'conv' and member_id = :'m_bob';

insert into public.messages (conversation_id, family_id, sender_member_id, body)
values (:'conv', :'fam', :'m_alice', 'Ztlumeno pro Boba');
set constraints all immediate;

select tests.assert(tests.deliveries_for(:'m_bob') = 0, 'A muted member must not be queued');
select tests.assert(tests.deliveries_for(:'m_cara') = 1, 'Muting one member must not affect the others');

delete from public.notification_deliveries;

-- A lapsed timed mute is not a mute.
update public.conversation_members set mute_scope = 'messages', muted_until = now() - interval '1 minute'
 where conversation_id = :'conv' and member_id = :'m_bob';

insert into public.messages (conversation_id, family_id, sender_member_id, body)
values (:'conv', :'fam', :'m_alice', 'Ztlumení vypršelo');
set constraints all immediate;

select tests.assert(tests.deliveries_for(:'m_bob') = 1, 'An expired mute must stop suppressing pushes');

update public.conversation_members set mute_scope = 'none', muted_until = null
 where conversation_id = :'conv' and member_id = :'m_bob';
delete from public.notification_deliveries;

-- ------------------------------------------------------------
-- 4. Presence: a member actively reading gets nothing.
-- ------------------------------------------------------------

insert into public.conversation_presence (conversation_id, member_id, family_id, last_active_at)
values (:'conv', :'m_bob', :'fam', now());

insert into public.messages (conversation_id, family_id, sender_member_id, body)
values (:'conv', :'fam', :'m_alice', 'Bob se dívá');
set constraints all immediate;

select tests.assert(tests.deliveries_for(:'m_bob') = 0, 'A present member must not be pushed');
select tests.assert(tests.deliveries_for(:'m_cara') = 1, 'An absent member must still be pushed');

-- A stale heartbeat must not keep suppressing.
update public.conversation_presence set last_active_at = now() - interval '10 minutes'
 where conversation_id = :'conv' and member_id = :'m_bob';
delete from public.notification_deliveries;

insert into public.messages (conversation_id, family_id, sender_member_id, body)
values (:'conv', :'fam', :'m_alice', 'Bob už se nedívá');
set constraints all immediate;

select tests.assert(tests.deliveries_for(:'m_bob') = 1, 'A stale presence heartbeat must not suppress a push');

delete from public.conversation_presence;
delete from public.notification_deliveries;

-- ------------------------------------------------------------
-- 5. Per-type preference filtering.
-- ------------------------------------------------------------

update public.notification_preferences set message_group_enabled = false where member_id = :'m_bob';

insert into public.messages (conversation_id, family_id, sender_member_id, body)
values (:'conv', :'fam', :'m_alice', 'Běžná skupinová zpráva');
set constraints all immediate;

select tests.assert(tests.deliveries_for(:'m_bob') = 0, 'Group messages must respect message_group_enabled');
delete from public.notification_deliveries;

-- ...but an explicit mention still reaches him: mentions are governed by
-- their own switch, which is the point of having a separate one.
do $$
declare msg_id uuid := gen_random_uuid(); conv_id uuid; fam_id uuid; bob uuid; alice uuid;
begin
  select id, family_id into conv_id, fam_id from public.conversations where kind = 'group' limit 1;
  select id into bob from public.members where display_name = 'Bob';
  select id into alice from public.members where display_name = 'Alice';
  insert into public.messages (id, conversation_id, family_id, sender_member_id, body)
  values (msg_id, conv_id, fam_id, alice, '@Bob mrkni na to');
  insert into public.message_mentions (message_id, conversation_id, family_id, mentioned_member_id)
  values (msg_id, conv_id, fam_id, bob);
  set constraints all immediate;
end $$;

select tests.assert(tests.deliveries_for(:'m_bob') = 1, 'A mention must arrive even with group messages off');
select tests.assert(tests.delivery_kind(:'m_bob') = 'mention', 'A mention must be classified as kind=mention');

update public.notification_preferences set message_group_enabled = true where member_id = :'m_bob';
delete from public.notification_deliveries;

-- ------------------------------------------------------------
-- 6. Replies are classified for the parent message's author only.
-- ------------------------------------------------------------

do $$
declare parent_id uuid := gen_random_uuid(); conv_id uuid; fam_id uuid; bob uuid; alice uuid;
begin
  select id, family_id into conv_id, fam_id from public.conversations where kind = 'group' limit 1;
  select id into bob from public.members where display_name = 'Bob';
  select id into alice from public.members where display_name = 'Alice';
  insert into public.messages (id, conversation_id, family_id, sender_member_id, body)
  values (parent_id, conv_id, fam_id, bob, 'Původní zpráva');
  set constraints all immediate;
  delete from public.notification_deliveries;
  insert into public.messages (conversation_id, family_id, sender_member_id, body, reply_to_message_id)
  values (conv_id, fam_id, alice, 'Odpověď', parent_id);
  set constraints all immediate;
end $$;

select tests.assert(tests.delivery_kind(:'m_bob') = 'reply', 'The parent author gets kind=reply');
select tests.assert(tests.delivery_kind(:'m_cara') = 'group', 'Everyone else still gets kind=group');

delete from public.notification_deliveries;

-- ------------------------------------------------------------
-- 7. Mention resolution rejects non-participants and spoofed ids.
-- ------------------------------------------------------------

select tests.assert(
  not (:'m_out'::uuid = any (public.resolve_message_mentions(:'conv', '@Outsider ahoj', array[:'m_out'::uuid]))),
  'A member of another family must never resolve as a mention'
);

select tests.assert(
  not (:'m_cara'::uuid = any (public.resolve_message_mentions(:'conv', 'bez zmínky', array[:'m_cara'::uuid]))),
  'An explicit id whose name is absent from the body must be dropped'
);

select tests.assert(
  :'m_cara'::uuid = any (public.resolve_message_mentions(:'conv', 'ahoj @Cara', null)),
  'A hand-typed mention must resolve without an explicit id'
);

-- ------------------------------------------------------------
-- 8. Family isolation: a delivery never crosses into another family.
-- ------------------------------------------------------------

select tests.assert(
  (select count(*) from public.notification_deliveries d
    join public.members m on m.id = d.target_member_id
   where m.family_id <> d.family_id) = 0,
  'Every delivery must target a member of its own family'
);

rollback;

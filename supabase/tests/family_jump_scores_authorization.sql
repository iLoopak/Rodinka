-- Family Jump score authorization and monotonic-record matrix.
-- Local Supabase only; every fixture is rolled back.

\set ON_ERROR_STOP on

\set user_a   '10000000-0000-4000-8000-000000000001'
\set user_b   '10000000-0000-4000-8000-000000000002'
\set family_a '20000000-0000-4000-8000-000000000001'
\set family_b '20000000-0000-4000-8000-000000000002'
\set member_a '30000000-0000-4000-8000-000000000001'
\set child_a  '30000000-0000-4000-8000-000000000002'
\set member_b '30000000-0000-4000-8000-000000000003'

begin;

create schema if not exists tests;

create or replace function tests.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not condition then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

create or replace function tests.assert_raises(sql text, message text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    return;
  end;
  raise exception 'ASSERTION FAILED (expected rejection): %', message;
end;
$$;

insert into auth.users (id, email) values
  (:'user_a', 'jump-a@test.invalid'),
  (:'user_b', 'jump-b@test.invalid');

insert into public.families (id, name) values
  (:'family_a', 'Jump Family A'),
  (:'family_b', 'Jump Family B');

insert into public.members (id, family_id, display_name, role, user_id, status) values
  (:'member_a', :'family_a', 'Jump Adult A', 'admin', :'user_a', 'active'),
  (:'child_a',  :'family_a', 'Jump Child A',  'child', null,      'active'),
  (:'member_b', :'family_b', 'Jump Adult B', 'admin', :'user_b', 'active');

-- An authenticated family member may record any playable member of their own
-- family, including a child without an auth account.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
select public.record_family_game_score(:'family_a', :'child_a', 'family_jump', 120);
select public.record_family_game_score(:'family_a', :'child_a', 'family_jump', 80);
select tests.assert(
  (select best_score from public.family_game_scores where member_id = :'child_a') = 120,
  'a family member must read the shared score after recording it');
reset role;

select tests.assert(
  (select best_score from public.family_game_scores where member_id = :'child_a') = 120,
  'a lower replay must never reduce the shared best score');

-- Direct writes stay unavailable even to an authenticated family member.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
select tests.assert_raises(
  format($$insert into public.family_game_scores (family_id, member_id, game_key, best_score) values (%L,%L,'family_jump',999)$$, :'family_a', :'member_a'),
  'authenticated clients must not bypass the score RPC');
select tests.assert_raises(
  format($$select public.record_family_game_score(%L,%L,'family_jump',40)$$, :'family_a', :'member_b'),
  'a player from another family must be rejected');
select tests.assert_raises(
  format($$select public.record_family_game_score(%L,%L,'unknown_game',40)$$, :'family_a', :'member_a'),
  'unknown game keys must be rejected');
select tests.assert_raises(
  format($$select public.record_family_game_score(%L,%L,'family_jump',-1)$$, :'family_a', :'member_a'),
  'negative scores must be rejected');
reset role;

-- Family B cannot observe family A's leaderboard.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);
select tests.assert(
  (select count(*) from public.family_game_scores where family_id = :'family_a') = 0,
  'another family must not read family A scores');
reset role;

-- Removed actors cannot write even while their auth session still exists.
update public.members set status = 'removed' where id = :'member_a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
select tests.assert_raises(
  format($$select public.record_family_game_score(%L,%L,'family_jump',200)$$, :'family_a', :'child_a'),
  'a removed member must not publish scores');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select tests.assert_raises(
  $$select count(*) from public.family_game_scores$$,
  'anonymous clients must not read game scores');
reset role;

rollback;

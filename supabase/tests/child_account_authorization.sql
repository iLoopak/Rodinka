-- Child account authorization matrix.
--
-- Runs against a LOCAL Supabase stack only. It writes synthetic families and
-- auth users and must never be pointed at a project holding real data:
--
--   npx supabase db reset
--   npm run test:db
--
-- Identities are simulated the way PostgREST does it — assume the
-- `authenticated` role and set the JWT claims the request would carry — so the
-- policies under test are the real ones, executed by the real planner.
--
-- Role switching is written inline rather than wrapped in a helper function on
-- purpose: `SET LOCAL ROLE` issued inside a function body is reverted when the
-- function exits, which would silently run every check as the owning superuser
-- with RLS bypassed.
--
-- Everything runs in one transaction and rolls back, so fixtures never survive.
-- Each check raises on failure; run with ON_ERROR_STOP so the first violation
-- exits non-zero.

\set ON_ERROR_STOP on

\set admin_a   '00000000-0000-4000-8000-00000000a001'
\set parent_a  '00000000-0000-4000-8000-00000000a002'
\set child_a   '00000000-0000-4000-8000-00000000a003'
\set child_b   '00000000-0000-4000-8000-00000000a004'
\set adult_b   '00000000-0000-4000-8000-00000000b001'
\set nofamily  '00000000-0000-4000-8000-00000000f001'

\set m_admin_a '00000000-0000-4000-8000-0000000ma001'
\set m_parent_a '00000000-0000-4000-8000-0000000ma002'
\set m_child_a '00000000-0000-4000-8000-0000000mc001'
\set m_child_b '00000000-0000-4000-8000-0000000mc002'
\set m_child_c '00000000-0000-4000-8000-0000000mc003'
\set fam_a     '00000000-0000-4000-8000-0000000fa001'
\set task_a    '00000000-0000-4000-8000-0000000t0001'
\set task_b    '00000000-0000-4000-8000-0000000t0002'

begin;

create schema if not exists tests;

create or replace function tests.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not condition then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

-- Asserts that `sql` raises. A silent empty result and a hard rejection are
-- different outcomes; this distinguishes them.
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

-- ============================================================
-- Fixtures: synthetic only. No real names, emails, or households.
-- ============================================================

insert into auth.users (id, email) values
  (:'admin_a', 'a-admin@test.invalid'),
  (:'parent_a', 'a-parent@test.invalid'),
  (:'child_a', 'child.a-one@children.rodinka.invalid'),
  (:'child_b', 'child.a-two@children.rodinka.invalid'),
  (:'adult_b', 'b-adult@test.invalid'),
  (:'nofamily', 'no-family@test.invalid');

insert into families (id, name) values
  (:'fam_a', 'Family A Test'),
  ('00000000-0000-4000-8000-0000000fb001', 'Family B Test');

insert into members (id, family_id, display_name, role, user_id, status) values
  (:'m_admin_a',  :'fam_a', 'A Admin',  'admin',  :'admin_a',  'active'),
  (:'m_parent_a', :'fam_a', 'A Parent', 'parent', :'parent_a', 'active'),
  (:'m_child_a',  :'fam_a', 'Child A',  'child',  :'child_a',  'active'),
  (:'m_child_b',  :'fam_a', 'Child B',  'child',  :'child_b',  'active'),
  (:'m_child_c',  :'fam_a', 'Child C',  'child',  null,        'active'),
  ('00000000-0000-4000-8000-0000000mb001', '00000000-0000-4000-8000-0000000fb001', 'B Adult', 'admin', :'adult_b', 'active');

-- A reward-bearing, auto-approved task assigned to child A: the exact shape the
-- occurrence-replay defect needed.
insert into chores (id, family_id, title, assigned_to, due_date, status, reward_enabled, reward_amount, requires_approval, recurrence_type)
values (:'task_a', :'fam_a', 'Test Task A', :'m_child_a', current_date, 'active', true, 10, false, 'daily');

insert into chores (id, family_id, title, assigned_to, due_date, status, recurrence_type)
values (:'task_b', :'fam_a', 'Test Task B', :'m_child_b', current_date, 'active', 'none');

insert into child_accounts (member_id, login_name, internal_identifier, auth_user_id, status, activated_at)
values (:'m_child_a', 'a-one', 'child.a-one@children.rodinka.invalid', :'child_a', 'active', now());

-- ============================================================
-- Account lifecycle primitives are service-role only
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_a', 'role', 'authenticated')::text, true);
select tests.assert_raises(
  format($$select begin_child_account_provision(%L,%L,'newname','child.newname@children.rodinka.invalid')$$, :'m_child_c', :'m_admin_a'),
  'admin must not call the provisioning primitive directly (service role only)');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'child_a', 'role', 'authenticated')::text, true);
select tests.assert_raises(
  format($$select detach_child_account_access(%L,%L)$$, :'m_child_b', :'m_child_a'),
  'child must not revoke a sibling');
reset role;

-- ============================================================
-- child_accounts visibility
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'parent_a', 'role', 'authenticated')::text, true);
select tests.assert((select count(*) from child_accounts) = 1, 'family A parent reads the child account row');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'child_a', 'role', 'authenticated')::text, true);
select tests.assert((select count(*) from child_accounts) = 0, 'child must not read child_accounts, including their own');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'adult_b', 'role', 'authenticated')::text, true);
select tests.assert((select count(*) from child_accounts) = 0, 'family B adult must not read family A child accounts');
select tests.assert((select count(*) from chores) = 0, 'family B adult must not read family A chores');
select tests.assert((select count(*) from members where family_id = :'fam_a') = 0, 'family B adult must not read family A members');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'nofamily', 'role', 'authenticated')::text, true);
select tests.assert((select count(*) from child_accounts) = 0, 'user with no family must not read child accounts');
select tests.assert((select count(*) from members) = 0, 'user with no family must not read any members');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select tests.assert_raises($$select count(*) from child_accounts$$, 'anon must not reach child_accounts at all');
reset role;

-- ============================================================
-- Cross-member reads inside one family
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'child_a', 'role', 'authenticated')::text, true);
select tests.assert((select count(*) from chores where id = :'task_a') = 1, 'child A reads their own task');
select tests.assert((select count(*) from chores where id = :'task_b') = 0, 'child A must not read child B task');
reset role;

-- ============================================================
-- Child cannot escalate through legacy security-definer functions
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'child_a', 'role', 'authenticated')::text, true);
select tests.assert_raises(format($$select create_invite(%L)$$, :'fam_a'),
  'child must not create an adult invitation');
select tests.assert_raises(format($$select remove_household_member(%L, null, 'unassign', 'clear', null, false)$$, :'m_child_b'),
  'child must not remove a sibling');
select tests.assert_raises(format($$select record_payout(%L, 100, 'self payout')$$, :'m_child_a'),
  'child must not pay themselves out');
reset role;

-- ============================================================
-- Child limited profile: own cosmetic fields only
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'child_a', 'role', 'authenticated')::text, true);
-- The RPC accepts a display name argument; the 'limited' branch must ignore it.
select update_member_profile(:'m_child_a', 'Renamed By Child', null, 'mint', null, null, null);
select tests.assert_raises(format($$select update_member_profile(%L, 'Hacked', null, 'mint', null, null, null)$$, :'m_child_b'),
  'child must not edit a sibling profile');
reset role;

select tests.assert((select display_name from members where id = :'m_child_a') = 'Child A',
  'child must not rename themselves even though the RPC accepts the argument');
select tests.assert((select color_key from members where id = :'m_child_a') = 'mint',
  'child may still change their own colour');

-- ============================================================
-- Occurrence completion: the Batch 4 regression
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'child_a', 'role', 'authenticated')::text, true);
select complete_household_task(:'task_a', current_date);
reset role;

select tests.assert(
  (select count(*) from allowance_ledger where member_id = :'m_child_a') = 1,
  'completing the current occurrence credits the child once');

-- Replaying arbitrary occurrence dates must be rejected. Before the Batch 4
-- guard each of these succeeded and credited another reward, because
-- effective_task_assignee() falls back to chores.assigned_to for any date.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'child_a', 'role', 'authenticated')::text, true);
select tests.assert_raises(format($$select complete_household_task(%L, (current_date - 30))$$, :'task_a'),
  'child must not complete an unscheduled past occurrence via the RPC');
select tests.assert_raises(
  format($$insert into chore_completions (chore_id, completed_by, occurrence_due_date) values (%L,%L, current_date - 31)$$, :'task_a', :'m_child_a'),
  'child must not bypass the RPC with a direct insert for an unscheduled occurrence');
select tests.assert_raises(format($$select complete_household_task(%L, current_date)$$, :'task_b'),
  'child A must not complete child B task');
select tests.assert_raises(
  format($$insert into chore_completions (chore_id, completed_by, occurrence_due_date) values (%L,%L, current_date)$$, :'task_b', :'m_child_a'),
  'child A must not fabricate a completion on child B task');
reset role;

select tests.assert(
  (select count(*) from allowance_ledger where member_id = :'m_child_a') = 1,
  'no replay may add further allowance credit');

-- ============================================================
-- Adult regression: on-behalf and backfill stay free-form
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'parent_a', 'role', 'authenticated')::text, true);
-- The Batch 4 guard is child-only: an adult may still record a past occurrence.
select complete_household_task(:'task_b', current_date - 5);
reset role;

select tests.assert(
  (select count(*) from chore_completions where chore_id = :'task_b') = 1,
  'adult retains on-behalf completion for an arbitrary occurrence');
select tests.assert(
  (select completed_by from chore_completions where chore_id = :'task_b') = :'m_child_b',
  'on-behalf completion still attributes to the assigned child, not the adult');

rollback;

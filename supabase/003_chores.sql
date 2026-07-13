-- ============================================================
-- Family Organizer — Phase 1 schema: Chores + Allowance
-- Run this AFTER 001_schema.sql and 002_functions.sql in the Supabase SQL Editor
-- ============================================================

-- Chores: a task belonging to a family, assigned to one child member
create table chores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid not null references members(id) on delete cascade,
  reward_amount numeric(10,2) not null default 0,
  recurring boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Chore completions: a log of each time a chore was marked done
create table chore_completions (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references chores(id) on delete cascade,
  completed_by uuid not null references members(id) on delete cascade,
  completed_at timestamptz not null default now(),
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'rejected')),
  approved_by uuid references members(id) on delete set null,
  approved_at timestamptz
);

-- Allowance ledger: running record of amounts owed/paid per child
create table allowance_ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  amount numeric(10,2) not null, -- positive = credit owed, negative = payout given
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table chores enable row level security;
alter table chore_completions enable row level security;
alter table allowance_ledger enable row level security;

-- Helper: is the current authenticated user an admin/parent in this family?
-- (children never log in in Phase 0/1, but this keeps chore management
-- restricted to the grown-ups managing the family.)
create or replace function is_family_parent(fid uuid)
returns boolean as $$
  select exists (
    select 1 from members
    where family_id = fid and user_id = auth.uid() and role in ('admin', 'parent')
  );
$$ language sql security definer stable;

-- Chores: visible to the whole family, manageable by admins/parents
create policy "select chores in own family"
  on chores for select
  using (is_family_member(family_id));

create policy "create chores in own family"
  on chores for insert
  with check (is_family_parent(family_id));

-- Chore completions: visible to the whole family; anyone in the family can
-- mark a chore done (a parent does this on behalf of a child today).
-- No update policy — approving/rejecting goes through the RPC functions
-- below so the status change and ledger entry stay in sync (same pattern
-- as `families` having no insert policy in 001_schema.sql).
create policy "select completions in own family"
  on chore_completions for select
  using (
    exists (
      select 1 from chores c
      where c.id = chore_completions.chore_id and is_family_member(c.family_id)
    )
  );

create policy "create completions in own family"
  on chore_completions for insert
  with check (
    exists (
      select 1 from chores c
      join members m on m.family_id = c.family_id
      where c.id = chore_completions.chore_id
        and m.id = chore_completions.completed_by
        and is_family_member(c.family_id)
    )
  );

-- Allowance ledger: visible to the whole family; no direct insert policy —
-- entries are only ever created by the approve_chore_completion and
-- record_payout functions below, which validate amounts and authorization.
create policy "select ledger in own family"
  on allowance_ledger for select
  using (is_family_member(family_id));

-- ============================================================
-- Functions
-- ============================================================

-- Approves a pending chore completion and credits the assigned child's
-- allowance ledger in one atomic step. Only callable by an admin/parent of
-- the family. Re-checks status under a row lock so double-clicking approve
-- can't double-credit the ledger.
create or replace function approve_chore_completion(completion_id uuid)
returns uuid as $$
declare
  v_family_id uuid;
  v_reward numeric;
  v_title text;
  v_status text;
  v_completed_by uuid;
  v_approver_id uuid;
  v_ledger_id uuid;
begin
  select c.family_id, c.reward_amount, c.title, cc.status, cc.completed_by
    into v_family_id, v_reward, v_title, v_status, v_completed_by
  from chore_completions cc
  join chores c on c.id = cc.chore_id
  where cc.id = completion_id
  for update of cc;

  if v_family_id is null then
    raise exception 'Completion not found';
  end if;

  if not is_family_parent(v_family_id) then
    raise exception 'Not authorized to approve this completion';
  end if;

  if v_status <> 'pending_approval' then
    raise exception 'Completion is not pending approval';
  end if;

  select id into v_approver_id from members
  where family_id = v_family_id and user_id = auth.uid();

  update chore_completions
  set status = 'approved', approved_by = v_approver_id, approved_at = now()
  where id = completion_id;

  insert into allowance_ledger (family_id, member_id, amount, reason, created_by)
  values (v_family_id, v_completed_by, v_reward, v_title, auth.uid())
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$ language plpgsql security definer;

-- Rejects a pending chore completion. No ledger entry is created.
create or replace function reject_chore_completion(completion_id uuid)
returns void as $$
declare
  v_family_id uuid;
  v_status text;
  v_approver_id uuid;
begin
  select c.family_id, cc.status into v_family_id, v_status
  from chore_completions cc
  join chores c on c.id = cc.chore_id
  where cc.id = completion_id
  for update of cc;

  if v_family_id is null then
    raise exception 'Completion not found';
  end if;

  if not is_family_parent(v_family_id) then
    raise exception 'Not authorized to reject this completion';
  end if;

  if v_status <> 'pending_approval' then
    raise exception 'Completion is not pending approval';
  end if;

  select id into v_approver_id from members
  where family_id = v_family_id and user_id = auth.uid();

  update chore_completions
  set status = 'rejected', approved_by = v_approver_id, approved_at = now()
  where id = completion_id;
end;
$$ language plpgsql security definer;

-- Records a payout to a child (negative ledger entry), e.g. when a parent
-- actually hands over the money owed. Only callable by an admin/parent of
-- the child's family.
create or replace function record_payout(target_member_id uuid, payout_amount numeric, payout_reason text)
returns uuid as $$
declare
  v_family_id uuid;
  v_ledger_id uuid;
begin
  select family_id into v_family_id from members where id = target_member_id;

  if v_family_id is null then
    raise exception 'Member not found';
  end if;

  if not is_family_parent(v_family_id) then
    raise exception 'Not authorized to record a payout in this family';
  end if;

  if payout_amount <= 0 then
    raise exception 'Payout amount must be positive';
  end if;

  insert into allowance_ledger (family_id, member_id, amount, reason, created_by)
  values (v_family_id, target_member_id, -payout_amount, payout_reason, auth.uid())
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$ language plpgsql security definer;

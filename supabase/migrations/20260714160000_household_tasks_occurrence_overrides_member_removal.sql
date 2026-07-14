-- Household tasks, shared occurrence overrides, assignment history and safe
-- member removal. Backward compatible with the existing chores/activities data.

-- ============================================================
-- Active/removed household memberships
-- ============================================================

alter table members add column if not exists status text;
alter table members add column if not exists removed_at timestamptz;
alter table members add column if not exists removed_by_member_id uuid references members(id) on delete set null;
alter table members add column if not exists removal_reason text;
alter table members add column if not exists removed_user_id uuid;
alter table members add column if not exists restored_at timestamptz;
alter table members add column if not exists restored_by_member_id uuid references members(id) on delete set null;

update members set status = 'active' where status is null;
alter table members alter column status set default 'active';
alter table members alter column status set not null;
alter table members drop constraint if exists members_status_check;
alter table members add constraint members_status_check check (status in ('active', 'inactive', 'removed'));
create index if not exists members_family_status_idx on members(family_id, status);

create or replace function validate_activity_member_refs()
returns trigger language plpgsql as $$
begin
  if new.responsible_member_id is not null and not exists (
    select 1 from members m where m.id = new.responsible_member_id and m.family_id = new.family_id and m.status = 'active' and m.role in ('admin','parent')
  ) then raise exception 'Responsible member must be an active adult in the activity family'; end if;
  if new.secondary_responsible_member_id is not null and not exists (
    select 1 from members m where m.id = new.secondary_responsible_member_id and m.family_id = new.family_id and m.status = 'active' and m.role in ('admin','parent')
  ) then raise exception 'Secondary responsible member must be an active adult in the activity family'; end if;
  return new;
end;
$$;

create or replace function validate_activity_participant()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from activities a join members m on m.id = new.member_id
    where a.id = new.activity_id and a.family_id = m.family_id and m.status = 'active'
  ) then raise exception 'Participant must be an active member of the activity family'; end if;
  return new;
end;
$$;

create or replace function is_family_member(fid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from members
    where family_id = fid and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function is_family_parent(fid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from members
    where family_id = fid and user_id = auth.uid() and role in ('admin', 'parent') and status = 'active'
  );
$$;

-- ============================================================
-- General household task fields
-- ============================================================

alter table chores alter column assigned_to drop not null;
alter table chores alter column due_date drop not null;
alter table chores add column if not exists category text;
alter table chores add column if not exists priority text;
alter table chores add column if not exists reward_enabled boolean;
alter table chores add column if not exists reward_currency text;
alter table chores add column if not exists requires_approval boolean;
alter table chores add column if not exists created_by_member_id uuid references members(id) on delete set null;

update chores
set reward_enabled = reward_amount > 0,
    reward_currency = 'CZK',
    requires_approval = true,
    category = null,
    priority = null
where reward_enabled is null or reward_currency is null or requires_approval is null;

alter table chores alter column reward_enabled set default false;
alter table chores alter column reward_enabled set not null;
alter table chores alter column reward_currency set default 'CZK';
alter table chores alter column reward_currency set not null;
alter table chores alter column requires_approval set default false;
alter table chores alter column requires_approval set not null;
alter table chores drop constraint if exists chores_category_check;
alter table chores add constraint chores_category_check check (
  category is null or category in ('household','children','shopping','maintenance','administration','preparation','other')
);
alter table chores drop constraint if exists chores_priority_check;
alter table chores add constraint chores_priority_check check (priority is null or priority in ('low','normal','high'));
alter table chores drop constraint if exists chores_recurrence_requires_due_date_check;
alter table chores add constraint chores_recurrence_requires_due_date_check check (recurrence_type = 'none' or due_date is not null);
alter table chores drop constraint if exists chores_reward_consistency_check;
alter table chores add constraint chores_reward_consistency_check check (reward_enabled or reward_amount = 0);

drop policy if exists "create chores in own family" on chores;
create policy "create chores in own family" on chores for insert with check (
  is_family_parent(family_id)
  and (assigned_to is null or exists (
    select 1 from members m where m.id = chores.assigned_to and m.family_id = chores.family_id and m.status = 'active'
  ))
);

drop policy if exists "update chores in own family" on chores;
create policy "update chores in own family" on chores for update
using (is_family_parent(family_id))
with check (
  is_family_parent(family_id)
  and (assigned_to is null or exists (
    select 1 from members m where m.id = chores.assigned_to and m.family_id = chores.family_id and m.status = 'active'
  ))
);

-- ============================================================
-- Generic occurrence overrides and effective-assignment history
-- ============================================================

create table if not exists occurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  series_type text not null check (series_type in ('activity','task')),
  series_id uuid not null,
  occurrence_date date not null,
  companion_member_id uuid references members(id) on delete set null,
  assignee_member_id uuid references members(id) on delete set null,
  cancelled boolean not null default false,
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_type, series_id, occurrence_date),
  check (
    (series_type = 'activity' and assignee_member_id is null)
    or (series_type = 'task' and companion_member_id is null)
  )
);

create index if not exists occurrence_overrides_family_date_idx on occurrence_overrides(family_id, occurrence_date);
alter table occurrence_overrides enable row level security;
drop policy if exists "read occurrence overrides in own family" on occurrence_overrides;
create policy "read occurrence overrides in own family" on occurrence_overrides for select using (is_family_member(family_id));

create table if not exists series_assignment_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  series_type text not null check (series_type in ('activity','task')),
  series_id uuid not null,
  effective_from date not null,
  member_id uuid references members(id) on delete set null,
  changed_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(series_type, series_id, effective_from)
);

create index if not exists series_assignment_history_lookup_idx on series_assignment_history(series_type, series_id, effective_from desc);
alter table series_assignment_history enable row level security;
drop policy if exists "read assignment history in own family" on series_assignment_history;
create policy "read assignment history in own family" on series_assignment_history for select using (is_family_member(family_id));

-- Participant membership is versioned so changing/removing a participant
-- affects future occurrences without rewriting past calendar history.
create table if not exists activity_participant_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  member_id uuid not null references members(id),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index if not exists activity_participant_history_active_idx
  on activity_participant_history(activity_id, member_id) where effective_to is null;
create index if not exists activity_participant_history_lookup_idx
  on activity_participant_history(activity_id, effective_from, effective_to);
alter table activity_participant_history enable row level security;
drop policy if exists "read activity participant history in own family" on activity_participant_history;
create policy "read activity participant history in own family" on activity_participant_history for select using (is_family_member(family_id));

insert into activity_participant_history(family_id, activity_id, member_id, effective_from)
select a.family_id, ap.activity_id, ap.member_id, a.start_date
from activity_participants ap join activities a on a.id = ap.activity_id
on conflict do nothing;

create or replace function capture_activity_participant_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare fid uuid; series_start date;
begin
  select family_id, start_date into fid, series_start from activities where id = coalesce(new.activity_id, old.activity_id);
  if tg_op = 'DELETE' then
    delete from activity_participant_history
    where activity_id = old.activity_id and member_id = old.member_id and effective_to is null and effective_from >= current_date;
    update activity_participant_history set effective_to = current_date - 1
    where activity_id = old.activity_id and member_id = old.member_id and effective_to is null;
    return old;
  end if;
  insert into activity_participant_history(family_id, activity_id, member_id, effective_from)
  values(fid, new.activity_id, new.member_id, greatest(series_start, current_date))
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists activity_participant_history_capture on activity_participants;
create trigger activity_participant_history_capture after insert or delete on activity_participants
for each row execute function capture_activity_participant_history();

-- Administratively unassigned activities are allowed after safe member
-- removal. Normal create/edit flows still require a participant in their RPC.
drop trigger if exists participant_delete_keeps_activity_valid on activity_participants;
drop trigger if exists activity_requires_participant on activities;

insert into series_assignment_history(family_id, series_type, series_id, effective_from, member_id)
select family_id, 'activity', id, start_date, responsible_member_id from activities
on conflict do nothing;

insert into series_assignment_history(family_id, series_type, series_id, effective_from, member_id)
select family_id, 'task', id, coalesce(due_date, created_at::date), assigned_to from chores
on conflict do nothing;

create or replace function validate_occurrence_override()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor members%rowtype; target members%rowtype;
begin
  select * into actor from members where family_id = new.family_id and user_id = auth.uid() and status = 'active';
  if actor.id is null or actor.role not in ('admin','parent') then raise exception 'Not authorized to manage occurrence overrides'; end if;
  if tg_op = 'INSERT' then new.created_by_member_id := coalesce(new.created_by_member_id, actor.id); end if;
  new.updated_at := now();
  if new.series_type = 'activity' then
    if not exists (select 1 from activities where id = new.series_id and family_id = new.family_id) then raise exception 'Activity series not found'; end if;
    if new.companion_member_id is not null then
      select * into target from members where id = new.companion_member_id and family_id = new.family_id and status = 'active';
      if target.id is null or target.role not in ('admin','parent') then raise exception 'Companion must be an active adult'; end if;
    end if;
  else
    if not exists (select 1 from chores where id = new.series_id and family_id = new.family_id) then raise exception 'Task series not found'; end if;
    if new.assignee_member_id is not null and not exists (
      select 1 from members where id = new.assignee_member_id and family_id = new.family_id and status = 'active'
    ) then raise exception 'Assignee must be an active family member'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists occurrence_override_guard on occurrence_overrides;
create trigger occurrence_override_guard before insert or update on occurrence_overrides
for each row execute function validate_occurrence_override();

create or replace function capture_series_assignment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_id uuid; next_member uuid; previous_member uuid; kind text; change_date date;
begin
  select id into actor_id from members where family_id = new.family_id and user_id = auth.uid() and status = 'active';
  if tg_table_name = 'activities' then
    kind := 'activity'; next_member := new.responsible_member_id;
    previous_member := case when tg_op='INSERT' then null else old.responsible_member_id end;
    change_date := case when tg_op='INSERT' then new.start_date else current_date end;
  else
    kind := 'task'; next_member := new.assigned_to;
    previous_member := case when tg_op='INSERT' then null else old.assigned_to end;
    change_date := case when tg_op='INSERT' then coalesce(new.due_date,new.created_at::date) else current_date end;
  end if;
  if tg_op='INSERT' or next_member is distinct from previous_member then
    insert into series_assignment_history(family_id, series_type, series_id, effective_from, member_id, changed_by_member_id)
    values(new.family_id, kind, new.id, change_date, next_member, actor_id)
    on conflict(series_type, series_id, effective_from) do update set member_id = excluded.member_id, changed_by_member_id = excluded.changed_by_member_id;
  end if;
  return new;
end;
$$;
drop trigger if exists activity_assignment_history on activities;
create trigger activity_assignment_history after update of responsible_member_id on activities
for each row execute function capture_series_assignment_change();
drop trigger if exists task_assignment_history on chores;
create trigger task_assignment_history after update of assigned_to on chores
for each row execute function capture_series_assignment_change();
drop trigger if exists activity_initial_assignment_history on activities;
create trigger activity_initial_assignment_history after insert on activities
for each row execute function capture_series_assignment_change();
drop trigger if exists task_initial_assignment_history on chores;
create trigger task_initial_assignment_history after insert on chores
for each row execute function capture_series_assignment_change();

create or replace function set_occurrence_member_override(
  p_series_type text, p_series_id uuid, p_occurrence_date date, p_member_id uuid, p_restore_default boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare fid uuid; recurring boolean; actor_id uuid;
begin
  if p_series_type = 'activity' then
    select family_id, recurrence_type <> 'one_off' into fid, recurring from activities where id = p_series_id;
  elsif p_series_type = 'task' then
    select family_id, recurrence_type <> 'none' into fid, recurring from chores where id = p_series_id;
  else raise exception 'Unsupported series type'; end if;
  if fid is null or not is_family_parent(fid) then raise exception 'Not authorized'; end if;
  select id into actor_id from members where family_id = fid and user_id = auth.uid() and status = 'active';
  if not recurring then
    if p_series_type = 'activity' then update activities set responsible_member_id = p_member_id where id = p_series_id;
    else update chores set assigned_to = p_member_id where id = p_series_id; end if;
    return jsonb_build_object('override', false, 'member_id', p_member_id);
  end if;
  if p_restore_default then
    delete from occurrence_overrides where series_type = p_series_type and series_id = p_series_id and occurrence_date = p_occurrence_date;
    return jsonb_build_object('override', false, 'member_id', null);
  end if;
  insert into occurrence_overrides(family_id, series_type, series_id, occurrence_date, companion_member_id, assignee_member_id, created_by_member_id)
  values(fid, p_series_type, p_series_id, p_occurrence_date,
    case when p_series_type = 'activity' then p_member_id end,
    case when p_series_type = 'task' then p_member_id end, actor_id)
  on conflict(series_type, series_id, occurrence_date) do update set
    companion_member_id = excluded.companion_member_id,
    assignee_member_id = excluded.assignee_member_id,
    updated_at = now();
  return jsonb_build_object('override', true, 'member_id', p_member_id);
end;
$$;

-- ============================================================
-- Completion snapshots and optional approval/reward lifecycle
-- ============================================================

alter table chore_completions add column if not exists assigned_member_id uuid references members(id) on delete set null;
alter table chore_completions add column if not exists assignment_was_override boolean;
alter table chore_completions add column if not exists requires_approval boolean;
alter table chore_completions add column if not exists reward_enabled boolean;
alter table chore_completions add column if not exists task_category text;

update chore_completions cc set
  assigned_member_id = coalesce(cc.assigned_member_id, cc.completed_by),
  assignment_was_override = coalesce(cc.assignment_was_override, false),
  requires_approval = coalesce(cc.requires_approval, true),
  reward_enabled = coalesce(cc.reward_enabled, cc.reward_amount > 0)
where cc.assigned_member_id is null or cc.assignment_was_override is null or cc.requires_approval is null or cc.reward_enabled is null;

alter table chore_completions alter column assignment_was_override set default false;
alter table chore_completions alter column assignment_was_override set not null;
alter table chore_completions alter column requires_approval set default true;
alter table chore_completions alter column requires_approval set not null;
alter table chore_completions alter column reward_enabled set default false;
alter table chore_completions alter column reward_enabled set not null;

create or replace function prepare_chore_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare definition chores%rowtype; effective_assignee uuid; overridden boolean := false; v_occurrence_date date;
begin
  select * into definition from chores where id = new.chore_id for update;
  if definition.id is null then raise exception 'Task not found'; end if;
  if definition.status <> 'active' then raise exception 'Archived task cannot be completed'; end if;
  v_occurrence_date := coalesce(new.occurrence_due_date, definition.due_date, current_date);
  select assignee_member_id into effective_assignee
  from occurrence_overrides where series_type = 'task' and series_id = definition.id
    and occurrence_overrides.occurrence_date = v_occurrence_date;
  overridden := found;
  if not overridden then
    select member_id into effective_assignee from series_assignment_history
    where series_type='task' and series_id=definition.id and effective_from <= v_occurrence_date
    order by effective_from desc limit 1;
    if not found then effective_assignee := definition.assigned_to; end if;
  end if;
  if effective_assignee is not null and new.completed_by is distinct from effective_assignee and not is_family_parent(definition.family_id) then
    raise exception 'Completion member must match task assignee';
  end if;
  new.completed_by := coalesce(effective_assignee, new.completed_by);
  new.occurrence_due_date := v_occurrence_date;
  new.chore_title := definition.title;
  new.reward_amount := case when definition.reward_enabled then definition.reward_amount else 0 end;
  new.reward_enabled := definition.reward_enabled;
  new.requires_approval := definition.requires_approval;
  new.assigned_member_id := effective_assignee;
  new.assignment_was_override := coalesce(overridden, false);
  new.task_category := definition.category;
  new.status := case when definition.requires_approval then 'pending_approval' else 'approved' end;
  new.approved_by := null;
  new.approved_at := case when definition.requires_approval then null else now() end;
  return new;
end;
$$;

create or replace function complete_household_task(p_task_id uuid, p_occurrence_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare definition chores%rowtype; actor_id uuid; completion chore_completions%rowtype; next_due date; ledger_id uuid;
begin
  select * into definition from chores where id = p_task_id for update;
  if definition.id is null or not is_family_member(definition.family_id) then raise exception 'Task not found'; end if;
  if exists (
    select 1 from chore_completions
    where chore_id=definition.id
      and occurrence_due_date=coalesce(p_occurrence_date,definition.due_date,current_date)
      and status in ('pending_approval','approved')
  ) then raise exception 'This task occurrence is already completed'; end if;
  select id into actor_id from members where family_id = definition.family_id and user_id = auth.uid() and status = 'active';
  insert into chore_completions(chore_id, completed_by, occurrence_due_date)
  values(definition.id, coalesce(definition.assigned_to, actor_id), coalesce(p_occurrence_date, definition.due_date, current_date))
  returning * into completion;
  if completion.status = 'approved' then
    if completion.reward_enabled and completion.reward_amount > 0 then
      insert into allowance_ledger(family_id, member_id, amount, reason, entry_type, source_chore_completion_id, created_by)
      values(definition.family_id, completion.completed_by, completion.reward_amount, completion.chore_title, 'chore_reward', completion.id, auth.uid())
      returning id into ledger_id;
    end if;
    if definition.recurrence_type = 'none' then
      update chores set status = 'archived' where id = definition.id;
    else
      next_due := get_next_chore_due_date(definition.recurrence_type, completion.occurrence_due_date, current_date,
        definition.recurrence_weekdays, definition.preferred_day_of_month);
      update chores set due_date = next_due where id = definition.id;
    end if;
  end if;
  return jsonb_build_object('completion_id', completion.id, 'status', completion.status, 'next_due_date', next_due, 'ledger_id', ledger_id);
end;
$$;

drop function if exists approve_chore_completion(uuid, date);
create function approve_chore_completion(completion_id uuid, approval_date date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare completion chore_completions%rowtype; definition chores%rowtype; approver_id uuid; ledger_id uuid; next_due_date date;
begin
  select * into completion from chore_completions where id = completion_id for update;
  if completion.id is null then raise exception 'Completion not found'; end if;
  select * into definition from chores where id = completion.chore_id for update;
  if definition.id is null or not is_family_parent(definition.family_id) then raise exception 'Not authorized'; end if;
  if completion.status <> 'pending_approval' or not completion.requires_approval then raise exception 'Completion is not pending approval'; end if;
  select id into approver_id from members where family_id = definition.family_id and user_id = auth.uid() and status = 'active';
  if approver_id = completion.completed_by then raise exception 'A member cannot approve their own task'; end if;
  update chore_completions set status = 'approved', approved_by = approver_id, approved_at = now() where id = completion_id;
  if completion.reward_enabled and completion.reward_amount > 0 then
    insert into allowance_ledger(family_id, member_id, amount, reason, entry_type, source_chore_completion_id, created_by)
    values(definition.family_id, completion.completed_by, completion.reward_amount, completion.chore_title, 'chore_reward', completion_id, auth.uid())
    returning id into ledger_id;
  end if;
  if definition.recurrence_type = 'none' then update chores set status = 'archived' where id = definition.id;
  else
    next_due_date := get_next_chore_due_date(definition.recurrence_type, completion.occurrence_due_date, coalesce(approval_date,current_date), definition.recurrence_weekdays, definition.preferred_day_of_month);
    update chores set due_date = next_due_date where id = definition.id;
  end if;
  return jsonb_build_object('ledger_id', ledger_id, 'next_due_date', next_due_date, 'chore_id', definition.id);
end;
$$;

-- ============================================================
-- Transactional member removal / restoration and audit
-- ============================================================

create table if not exists member_removal_audit (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id), performed_by_member_id uuid not null references members(id),
  action text not null check(action in ('removed','restored')), replacement_member_id uuid references members(id),
  task_strategy text, activity_strategy text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table member_removal_audit enable row level security;
drop policy if exists "admins read member removal audit" on member_removal_audit;
create policy "admins read member removal audit" on member_removal_audit for select using (
  exists(select 1 from members where family_id = member_removal_audit.family_id and user_id = auth.uid() and role = 'admin' and status = 'active')
);

create or replace function remove_household_member(
  p_member_id uuid, p_replacement_member_id uuid default null,
  p_task_strategy text default 'unassign', p_activity_strategy text default 'clear', p_reason text default null,
  p_allow_self boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare target members%rowtype; actor members%rowtype; replacement members%rowtype; task_count integer; activity_count integer; override_count integer;
begin
  select * into target from members where id = p_member_id for update;
  if target.id is null then raise exception 'Member not found'; end if;
  select * into actor from members where family_id = target.family_id and user_id = auth.uid() and status = 'active';
  if actor.id is null or actor.role not in ('admin','parent') then raise exception 'Not authorized'; end if;
  if actor.id = target.id and not p_allow_self then raise exception 'Use the leave household flow for your own membership'; end if;
  if actor.id <> target.id and p_allow_self then raise exception 'Self-leave can only target the current member'; end if;
  if target.status = 'removed' then return jsonb_build_object('status','already_removed'); end if;
  if target.role = 'admin' and (select count(*) from members where family_id=target.family_id and role='admin' and status='active') <= 1 then
    raise exception 'The last active administrator cannot be removed';
  end if;
  if target.role in ('admin','parent') and (select count(*) from members where family_id=target.family_id and role in ('admin','parent') and status='active') <= 1 then
    raise exception 'The last active adult cannot be removed';
  end if;
  if p_task_strategy not in ('unassign','reassign') or p_activity_strategy not in ('clear','reassign') then raise exception 'Invalid removal strategy'; end if;
  if p_task_strategy='reassign' or p_activity_strategy='reassign' then
    select * into replacement from members where id=p_replacement_member_id and family_id=target.family_id and status='active';
    if replacement.id is null or replacement.id=target.id then raise exception 'Choose an active replacement member'; end if;
    if p_activity_strategy='reassign' and replacement.role not in ('admin','parent') then raise exception 'Activity replacement must be an adult'; end if;
  end if;
  select count(*) into task_count from chores where family_id=target.family_id and status='active' and assigned_to=target.id;
  update chores set assigned_to=case when p_task_strategy='reassign' then replacement.id else null end where family_id=target.family_id and status='active' and assigned_to=target.id;
  select count(*) into activity_count from activities where family_id=target.family_id and status='active' and responsible_member_id=target.id;
  update activities set responsible_member_id=case when p_activity_strategy='reassign' then replacement.id else null end where family_id=target.family_id and status='active' and responsible_member_id=target.id;
  update activities set secondary_responsible_member_id=null where family_id=target.family_id and secondary_responsible_member_id=target.id;
  delete from activity_participants ap using activities a
    where ap.activity_id=a.id and a.family_id=target.family_id and ap.member_id=target.id;
  update activities set child_id=null where family_id=target.family_id and child_id=target.id;
  select count(*) into override_count from occurrence_overrides where family_id=target.family_id and occurrence_date>=current_date and (companion_member_id=target.id or assignee_member_id=target.id);
  update occurrence_overrides set
    companion_member_id=case when series_type='activity' then case when p_activity_strategy='reassign' then replacement.id else null end else companion_member_id end,
    assignee_member_id=case when series_type='task' then case when p_task_strategy='reassign' then replacement.id else null end else assignee_member_id end,
    updated_at=now()
  where family_id=target.family_id and occurrence_date>=current_date and (companion_member_id=target.id or assignee_member_id=target.id);
  update push_subscriptions set revoked_at=now(), disabled_at=now() where target_member_id=target.id and revoked_at is null;
  update notification_deliveries set status='cancelled', error_code='member_removed' where target_member_id=target.id and status in ('pending','failed','processing');
  delete from reminders where target_member_id=target.id;
  update members set status='removed', removed_at=now(), removed_by_member_id=actor.id, removal_reason=nullif(trim(p_reason),''),
    removed_user_id=user_id, user_id=null where id=target.id;
  insert into member_removal_audit(family_id,member_id,performed_by_member_id,action,replacement_member_id,task_strategy,activity_strategy,details)
  values(target.family_id,target.id,actor.id,'removed',replacement.id,p_task_strategy,p_activity_strategy,
    jsonb_build_object('tasks',task_count,'activities',activity_count,'overrides',override_count));
  return jsonb_build_object('status','removed','tasks',task_count,'activities',activity_count,'overrides',override_count);
end;
$$;

create or replace function restore_household_member(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target members%rowtype; actor members%rowtype;
begin
  select * into target from members where id=p_member_id for update;
  if target.id is null then raise exception 'Member not found'; end if;
  select * into actor from members where family_id=target.family_id and user_id=auth.uid() and role='admin' and status='active';
  if actor.id is null then raise exception 'Only an administrator can restore a member'; end if;
  if target.status='active' then return jsonb_build_object('status','already_active'); end if;
  update members set status='active', restored_at=now(), restored_by_member_id=actor.id,
    removed_at=null, removed_by_member_id=null where id=target.id;
  insert into member_removal_audit(family_id,member_id,performed_by_member_id,action,details)
  values(target.family_id,target.id,actor.id,'restored',jsonb_build_object('access_restored',false));
  return jsonb_build_object('status','restored','access_restored',false);
end;
$$;

revoke all on function set_occurrence_member_override(text, uuid, date, uuid, boolean) from public;
revoke all on function complete_household_task(uuid, date) from public;
revoke all on function approve_chore_completion(uuid, date) from public;
revoke all on function remove_household_member(uuid, uuid, text, text, text, boolean) from public;
revoke all on function restore_household_member(uuid) from public;
grant execute on function set_occurrence_member_override(text, uuid, date, uuid, boolean) to authenticated;
grant execute on function complete_household_task(uuid, date) to authenticated;
grant execute on function approve_chore_completion(uuid, date) to authenticated;
grant execute on function remove_household_member(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function restore_household_member(uuid) to authenticated;

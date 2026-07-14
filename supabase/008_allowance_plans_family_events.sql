-- Monthly allowance plans and multi-member family events.
-- Run after 007_member_profiles.sql. Historical migrations remain unchanged.

-- ============================================================
-- Allowance ledger provenance
-- Existing positive rows are treated as chore rewards and negative rows as
-- payouts. Older rows predate source ids, so those ids intentionally stay null.
-- ============================================================

alter table allowance_ledger add column entry_type text;
alter table allowance_ledger add column source_chore_completion_id uuid references chore_completions(id) on delete restrict;
update allowance_ledger set entry_type = case when amount < 0 then 'payout' else 'chore_reward' end;
alter table allowance_ledger alter column entry_type set not null;
alter table allowance_ledger add constraint allowance_ledger_entry_type_check
  check (entry_type in ('chore_reward', 'monthly_allowance', 'payout', 'adjustment'));
create unique index allowance_ledger_one_chore_reward_idx
  on allowance_ledger (source_chore_completion_id) where source_chore_completion_id is not null;

-- ============================================================
-- Monthly allowance plans, requirements, and settled cycles
-- ============================================================

create table allowance_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  payout_day smallint not null check (payout_day between 1 and 31),
  starts_on date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  condition_mode text not null default 'none' check (condition_mode in ('none', 'chores')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index allowance_plans_one_open_plan_per_child_idx
  on allowance_plans (member_id) where status <> 'archived';
create index allowance_plans_family_id_idx on allowance_plans (family_id);

create table allowance_plan_requirements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references allowance_plans(id) on delete cascade,
  chore_id uuid not null references chores(id) on delete restrict,
  requirement_type text not null check (requirement_type in ('per_cycle', 'weekly')),
  required_count integer not null check (required_count > 0),
  created_at timestamptz not null default now(),
  unique (plan_id, chore_id)
);

create table allowance_cycles (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references allowance_plans(id) on delete restrict,
  payout_date date not null,
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('credited', 'skipped')),
  credited_amount numeric(10,2) check (credited_amount is null or credited_amount > 0),
  ledger_entry_id uuid unique references allowance_ledger(id) on delete restrict,
  evaluated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (plan_id, payout_date),
  check (period_start < period_end),
  check ((status = 'credited' and credited_amount is not null) or (status = 'skipped' and credited_amount is null))
);

alter table allowance_ledger add column source_allowance_cycle_id uuid references allowance_cycles(id) on delete restrict;
create unique index allowance_ledger_one_monthly_credit_idx
  on allowance_ledger (source_allowance_cycle_id) where source_allowance_cycle_id is not null;

create or replace function validate_allowance_plan_member()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from members m
    where m.id = new.member_id and m.family_id = new.family_id and m.role = 'child'
  ) then
    raise exception 'Allowance plan member must be a child in the same family';
  end if;
  return new;
end;
$$;
create trigger allowance_plan_member_guard before insert or update on allowance_plans
  for each row execute function validate_allowance_plan_member();

create or replace function validate_allowance_requirement()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1
    from allowance_plans p
    join chores c on c.id = new.chore_id
    where p.id = new.plan_id
      and c.family_id = p.family_id
      and c.assigned_to = p.member_id
  ) then
    raise exception 'Requirement chore must belong to the plan child and family';
  end if;
  return new;
end;
$$;
create trigger allowance_requirement_guard before insert or update on allowance_plan_requirements
  for each row execute function validate_allowance_requirement();

alter table allowance_plans enable row level security;
alter table allowance_plan_requirements enable row level security;
alter table allowance_cycles enable row level security;

create policy "select allowance plans in own family" on allowance_plans for select
  using (is_family_member(family_id));
create policy "create allowance plans in own family" on allowance_plans for insert
  with check (is_family_parent(family_id));
create policy "update allowance plans in own family" on allowance_plans for update
  using (is_family_parent(family_id)) with check (is_family_parent(family_id));
create policy "select allowance requirements in own family" on allowance_plan_requirements for select
  using (exists (select 1 from allowance_plans p where p.id = plan_id and is_family_member(p.family_id)));
create policy "manage allowance requirements in own family" on allowance_plan_requirements for all
  using (exists (select 1 from allowance_plans p where p.id = plan_id and is_family_parent(p.family_id)))
  with check (exists (select 1 from allowance_plans p where p.id = plan_id and is_family_parent(p.family_id)));
create policy "select allowance cycles in own family" on allowance_cycles for select
  using (exists (select 1 from allowance_plans p where p.id = plan_id and is_family_member(p.family_id)));

-- Date-only helpers use UTC-independent date arithmetic. A cycle is
-- [previous payout, current payout), clamped to starts_on for its first run.
create or replace function allowance_payout_date(p_year integer, p_month integer, p_day integer)
returns date language sql immutable strict as $$
  select make_date(p_year, p_month, least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::integer));
$$;

create or replace function allowance_previous_payout(p_payout_date date, p_day integer)
returns date language sql immutable strict as $$
  select allowance_payout_date(
    extract(year from (p_payout_date - interval '1 month'))::integer,
    extract(month from (p_payout_date - interval '1 month'))::integer,
    p_day
  );
$$;

create or replace function allowance_requirements_met(
  p_plan_id uuid, p_member_id uuid, p_period_start date, p_period_end date
) returns boolean language plpgsql stable as $$
declare
  requirement record;
  bucket record;
  approved_count integer;
begin
  for requirement in
    select * from allowance_plan_requirements where plan_id = p_plan_id
  loop
    if requirement.requirement_type = 'per_cycle' then
      select count(*) into approved_count
      from chore_completions cc
      where cc.chore_id = requirement.chore_id
        and cc.completed_by = p_member_id
        and cc.status = 'approved'
        and (cc.completed_at at time zone 'UTC')::date >= p_period_start
        and (cc.completed_at at time zone 'UTC')::date < p_period_end;
      if approved_count < requirement.required_count then return false; end if;
    else
      -- Monday-Sunday buckets; partial edge weeks count only with >= 4 days.
      for bucket in
        with days as (
          select d::date day, date_trunc('week', d)::date week_start
          from generate_series(p_period_start, p_period_end - 1, interval '1 day') d
        )
        select greatest(min(day), p_period_start) bucket_start,
               least(max(day) + 1, p_period_end) bucket_end
        from days group by week_start having count(*) >= 4
      loop
        select count(*) into approved_count
        from chore_completions cc
        where cc.chore_id = requirement.chore_id
          and cc.completed_by = p_member_id
          and cc.status = 'approved'
          and (cc.completed_at at time zone 'UTC')::date >= bucket.bucket_start
          and (cc.completed_at at time zone 'UTC')::date < bucket.bucket_end;
        if approved_count < requirement.required_count then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function save_allowance_plan(target_plan_id uuid, plan_data jsonb, requirements_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  saved_plan_id uuid;
  fid uuid;
  requirement jsonb;
  mode text;
begin
  mode := plan_data->>'condition_mode';
  if target_plan_id is null then
    fid := (plan_data->>'family_id')::uuid;
    if not is_family_parent(fid) then raise exception 'Not authorized'; end if;
    insert into allowance_plans (
      family_id, member_id, amount, payout_day, starts_on, status, condition_mode, created_by
    ) values (
      fid, (plan_data->>'member_id')::uuid, (plan_data->>'amount')::numeric,
      (plan_data->>'payout_day')::smallint, (plan_data->>'starts_on')::date,
      coalesce(plan_data->>'status', 'active'), mode, auth.uid()
    ) returning id into saved_plan_id;
  else
    select family_id into fid from allowance_plans where id = target_plan_id for update;
    if fid is null then raise exception 'Allowance plan not found'; end if;
    if not is_family_parent(fid) then raise exception 'Not authorized'; end if;
    update allowance_plans set
      member_id = (plan_data->>'member_id')::uuid,
      amount = (plan_data->>'amount')::numeric,
      payout_day = (plan_data->>'payout_day')::smallint,
      starts_on = (plan_data->>'starts_on')::date,
      status = plan_data->>'status',
      condition_mode = mode,
      updated_at = now()
    where id = target_plan_id;
    saved_plan_id := target_plan_id;
    delete from allowance_plan_requirements where plan_id = saved_plan_id;
  end if;

  if mode = 'chores' then
    if jsonb_typeof(requirements_data) <> 'array' or jsonb_array_length(requirements_data) = 0 then
      raise exception 'Conditional allowance requires at least one chore';
    end if;
    for requirement in select value from jsonb_array_elements(requirements_data)
    loop
      insert into allowance_plan_requirements(plan_id, chore_id, requirement_type, required_count)
      values (
        saved_plan_id, (requirement->>'chore_id')::uuid,
        requirement->>'requirement_type', (requirement->>'required_count')::integer
      );
    end loop;
  end if;
  return saved_plan_id;
end;
$$;

create or replace function credit_monthly_allowance(plan_id uuid, payout_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p allowance_plans%rowtype;
  period_start date;
  expected_payout date;
  cycle_id uuid;
  ledger_id uuid;
begin
  select * into p from allowance_plans where id = plan_id for update;
  if p.id is null then raise exception 'Allowance plan not found'; end if;
  if not is_family_parent(p.family_id) then raise exception 'Not authorized'; end if;
  if p.status <> 'active' then raise exception 'Allowance plan is not active'; end if;
  if not exists (select 1 from members m where m.id = p.member_id and m.family_id = p.family_id and m.role = 'child') then
    raise exception 'Invalid allowance plan member';
  end if;
  expected_payout := allowance_payout_date(extract(year from payout_date)::integer, extract(month from payout_date)::integer, p.payout_day);
  if expected_payout <> payout_date or payout_date < p.starts_on then raise exception 'Invalid payout date'; end if;
  if payout_date > current_date then raise exception 'Allowance cycle is not due'; end if;
  period_start := greatest(allowance_previous_payout(payout_date, p.payout_day), p.starts_on);
  if p.condition_mode = 'chores' and (
    not exists (select 1 from allowance_plan_requirements r where r.plan_id = p.id)
    or not allowance_requirements_met(p.id, p.member_id, period_start, payout_date)
  ) then raise exception 'Allowance requirements are not met'; end if;

  insert into allowance_cycles (plan_id, payout_date, period_start, period_end, status, credited_amount, created_by)
  values (p.id, payout_date, period_start, payout_date, 'credited', p.amount, auth.uid())
  returning id into cycle_id;
  insert into allowance_ledger (family_id, member_id, amount, reason, entry_type, source_allowance_cycle_id, created_by)
  values (p.family_id, p.member_id, p.amount, 'Monthly allowance', 'monthly_allowance', cycle_id, auth.uid())
  returning id into ledger_id;
  update allowance_cycles set ledger_entry_id = ledger_id where id = cycle_id;
  return cycle_id;
exception when unique_violation then
  raise exception 'Allowance cycle is already settled';
end;
$$;

create or replace function skip_monthly_allowance(plan_id uuid, payout_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare p allowance_plans%rowtype; cycle_id uuid; period_start date; expected_payout date;
begin
  select * into p from allowance_plans where id = plan_id for update;
  if p.id is null then raise exception 'Allowance plan not found'; end if;
  if not is_family_parent(p.family_id) then raise exception 'Not authorized'; end if;
  expected_payout := allowance_payout_date(extract(year from payout_date)::integer, extract(month from payout_date)::integer, p.payout_day);
  if expected_payout <> payout_date or payout_date < p.starts_on or payout_date > current_date then raise exception 'Invalid payout date'; end if;
  period_start := greatest(allowance_previous_payout(payout_date, p.payout_day), p.starts_on);
  insert into allowance_cycles (plan_id, payout_date, period_start, period_end, status, credited_amount, created_by)
  values (p.id, payout_date, period_start, payout_date, 'skipped', null, auth.uid()) returning id into cycle_id;
  return cycle_id;
exception when unique_violation then raise exception 'Allowance cycle is already settled';
end;
$$;

create or replace function approve_chore_completion(completion_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_family_id uuid; v_reward numeric; v_title text; v_status text; v_completed_by uuid; v_approver_id uuid; v_ledger_id uuid;
begin
  select c.family_id, c.reward_amount, c.title, cc.status, cc.completed_by
    into v_family_id, v_reward, v_title, v_status, v_completed_by
  from chore_completions cc join chores c on c.id = cc.chore_id
  where cc.id = completion_id for update of cc;
  if v_family_id is null then raise exception 'Completion not found'; end if;
  if not is_family_parent(v_family_id) then raise exception 'Not authorized to approve this completion'; end if;
  if v_status <> 'pending_approval' then raise exception 'Completion is not pending approval'; end if;
  select id into v_approver_id from members where family_id = v_family_id and user_id = auth.uid();
  update chore_completions set status = 'approved', approved_by = v_approver_id, approved_at = now() where id = completion_id;
  insert into allowance_ledger (family_id, member_id, amount, reason, entry_type, source_chore_completion_id, created_by)
  values (v_family_id, v_completed_by, v_reward, v_title, 'chore_reward', completion_id, auth.uid()) returning id into v_ledger_id;
  return v_ledger_id;
end;
$$;

create or replace function record_payout(target_member_id uuid, payout_amount numeric, payout_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_family_id uuid; v_ledger_id uuid;
begin
  select family_id into v_family_id from members where id = target_member_id;
  if v_family_id is null then raise exception 'Member not found'; end if;
  if not is_family_parent(v_family_id) then raise exception 'Not authorized to record a payout in this family'; end if;
  if payout_amount <= 0 then raise exception 'Payout amount must be positive'; end if;
  insert into allowance_ledger (family_id, member_id, amount, reason, entry_type, created_by)
  values (v_family_id, target_member_id, -payout_amount, payout_reason, 'payout', auth.uid()) returning id into v_ledger_id;
  return v_ledger_id;
end;
$$;

-- ============================================================
-- Generalized activities and participants
-- ============================================================

alter table activities add column kind text not null default 'club' check (kind in ('club', 'event'));
alter table activities add column all_day boolean not null default false;
alter table activities drop constraint activities_category_check;
alter table activities add constraint activities_category_check check (category in (
  'swimming', 'dance', 'football', 'music', 'speech_therapy', 'club', 'camp', 'after_school', 'other',
  'vacation', 'trip', 'celebration', 'family_visit', 'other_event'
));
alter table activities alter column child_id drop not null;

create table activity_participants (
  activity_id uuid not null references activities(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, member_id)
);
insert into activity_participants (activity_id, member_id)
select id, child_id from activities where child_id is not null on conflict do nothing;
create index activity_participants_member_id_idx on activity_participants (member_id);

create or replace function validate_activity_member_refs()
returns trigger language plpgsql as $$
begin
  if new.responsible_member_id is not null and not exists (
    select 1 from members m where m.id = new.responsible_member_id and m.family_id = new.family_id
  ) then raise exception 'Responsible member must be in the activity family'; end if;
  if new.secondary_responsible_member_id is not null and not exists (
    select 1 from members m where m.id = new.secondary_responsible_member_id and m.family_id = new.family_id
  ) then raise exception 'Secondary responsible member must be in the activity family'; end if;
  return new;
end;
$$;
create trigger activity_member_refs_guard before insert or update on activities
  for each row execute function validate_activity_member_refs();

create or replace function validate_activity_participant()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from activities a join members m on m.id = new.member_id
    where a.id = new.activity_id and a.family_id = m.family_id
  ) then raise exception 'Participant must be in the activity family'; end if;
  return new;
end;
$$;
create trigger activity_participant_guard before insert or update on activity_participants
  for each row execute function validate_activity_participant();

create or replace function ensure_activity_has_participant()
returns trigger language plpgsql as $$
declare checked_activity_id uuid;
begin
  checked_activity_id := case when tg_table_name = 'activities' then new.id else old.activity_id end;
  if exists (select 1 from activities a where a.id = checked_activity_id)
    and not exists (select 1 from activity_participants ap where ap.activity_id = checked_activity_id)
  then raise exception 'Activity must have at least one participant'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create constraint trigger activity_requires_participant
  after insert or update on activities deferrable initially deferred
  for each row execute function ensure_activity_has_participant();
create constraint trigger participant_delete_keeps_activity_valid
  after delete or update on activity_participants deferrable initially deferred
  for each row execute function ensure_activity_has_participant();

alter table activity_participants enable row level security;
create policy "select activity participants in own family" on activity_participants for select
  using (exists (select 1 from activities a where a.id = activity_id and is_family_member(a.family_id)));

drop policy "insert activities in own family" on activities;
drop policy "update activities in own family" on activities;

create or replace function create_activity_with_participants(activity_data jsonb, participant_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare activity_id uuid; fid uuid; participant uuid;
begin
  fid := (activity_data->>'family_id')::uuid;
  if not is_family_parent(fid) then raise exception 'Not authorized'; end if;
  if coalesce(array_length(participant_ids, 1), 0) = 0 then raise exception 'At least one participant is required'; end if;
  if exists (select 1 from unnest(participant_ids) p left join members m on m.id = p where m.id is null or m.family_id <> fid) then
    raise exception 'All participants must belong to the family';
  end if;
  insert into activities (
    family_id, title, category, kind, all_day, child_id, responsible_member_id, secondary_responsible_member_id,
    location, coach_name, coach_phone, coach_email, notes, skill_level, start_date, end_date, recurrence_type,
    recurrence_weekdays, start_time, end_time, payment_amount, payment_frequency, next_payment_due_date, status,
    reminder_enabled, reminder_days_before, created_by
  ) values (
    fid, activity_data->>'title', activity_data->>'category', coalesce(activity_data->>'kind','club'),
    coalesce((activity_data->>'all_day')::boolean, false), participant_ids[1],
    (activity_data->>'responsible_member_id')::uuid, (activity_data->>'secondary_responsible_member_id')::uuid,
    activity_data->>'location', activity_data->>'coach_name', activity_data->>'coach_phone', activity_data->>'coach_email',
    activity_data->>'notes', activity_data->>'skill_level', (activity_data->>'start_date')::date,
    (activity_data->>'end_date')::date, activity_data->>'recurrence_type',
    (select array_agg(value::smallint) from jsonb_array_elements_text(
      case when jsonb_typeof(activity_data->'recurrence_weekdays') = 'array'
        then activity_data->'recurrence_weekdays' else '[]'::jsonb end)),
    (activity_data->>'start_time')::time, (activity_data->>'end_time')::time,
    (activity_data->>'payment_amount')::numeric, nullif(activity_data->>'payment_frequency',''),
    (activity_data->>'next_payment_due_date')::date, coalesce(activity_data->>'status','active'),
    coalesce((activity_data->>'reminder_enabled')::boolean, false), (activity_data->>'reminder_days_before')::smallint, auth.uid()
  ) returning id into activity_id;
  foreach participant in array participant_ids loop
    insert into activity_participants(activity_id, member_id) values (activity_id, participant) on conflict do nothing;
  end loop;
  return activity_id;
end;
$$;

create or replace function update_activity_with_participants(target_activity_id uuid, activity_data jsonb, participant_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid; participant uuid;
begin
  select family_id into fid from activities where id = target_activity_id for update;
  if fid is null then raise exception 'Activity not found'; end if;
  if not is_family_parent(fid) then raise exception 'Not authorized'; end if;
  if coalesce(array_length(participant_ids, 1), 0) = 0 then raise exception 'At least one participant is required'; end if;
  if exists (select 1 from unnest(participant_ids) p left join members m on m.id = p where m.id is null or m.family_id <> fid) then
    raise exception 'All participants must belong to the family';
  end if;
  update activities set
    title = activity_data->>'title', category = activity_data->>'category', kind = activity_data->>'kind',
    all_day = (activity_data->>'all_day')::boolean, child_id = participant_ids[1],
    responsible_member_id = (activity_data->>'responsible_member_id')::uuid,
    secondary_responsible_member_id = (activity_data->>'secondary_responsible_member_id')::uuid,
    location = activity_data->>'location', coach_name = activity_data->>'coach_name', coach_phone = activity_data->>'coach_phone',
    coach_email = activity_data->>'coach_email', notes = activity_data->>'notes', skill_level = activity_data->>'skill_level',
    start_date = (activity_data->>'start_date')::date, end_date = (activity_data->>'end_date')::date,
    recurrence_type = activity_data->>'recurrence_type',
    recurrence_weekdays = (select array_agg(value::smallint) from jsonb_array_elements_text(
      case when jsonb_typeof(activity_data->'recurrence_weekdays') = 'array'
        then activity_data->'recurrence_weekdays' else '[]'::jsonb end)),
    start_time = (activity_data->>'start_time')::time, end_time = (activity_data->>'end_time')::time,
    payment_amount = (activity_data->>'payment_amount')::numeric, payment_frequency = nullif(activity_data->>'payment_frequency',''),
    next_payment_due_date = (activity_data->>'next_payment_due_date')::date, status = activity_data->>'status',
    reminder_enabled = (activity_data->>'reminder_enabled')::boolean,
    reminder_days_before = (activity_data->>'reminder_days_before')::smallint, updated_at = now()
  where id = target_activity_id;
  delete from activity_participants where activity_id = target_activity_id and not (member_id = any(participant_ids));
  foreach participant in array participant_ids loop
    insert into activity_participants(activity_id, member_id) values (target_activity_id, participant) on conflict do nothing;
  end loop;
  return target_activity_id;
end;
$$;

-- Direct activity writes stay closed; the two RPCs above are the atomic
-- parent/admin boundary. Existing select policy remains in force.

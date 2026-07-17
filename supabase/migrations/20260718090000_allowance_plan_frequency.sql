-- Weekly allowance plans, plus a parent-facing note and a delete path.
-- Until now a plan was implicitly monthly: payout_day was mandatory and every
-- helper walked in whole months. Frequency becomes explicit, and a weekly plan
-- is anchored on an ISO weekday instead of a day of the month.

alter table allowance_plans add column frequency text not null default 'monthly'
  check (frequency in ('weekly', 'monthly'));
alter table allowance_plans add column payout_weekday smallint
  check (payout_weekday between 1 and 7);
alter table allowance_plans add column note text
  check (note is null or char_length(note) <= 500);

-- Existing rows are monthly and already carry payout_day, so they satisfy the
-- schedule constraint as-is and need no backfill.
alter table allowance_plans alter column payout_day drop not null;
alter table allowance_plans add constraint allowance_plans_schedule_check check (
  (frequency = 'monthly' and payout_day is not null and payout_weekday is null)
  or (frequency = 'weekly' and payout_weekday is not null and payout_day is null)
);

-- ============================================================
-- Schedule helpers
-- ============================================================

-- Both branches guard their own null argument, so a weekly plan (payout_day
-- null) and a monthly plan (payout_weekday null) are each safe to pass in.
create or replace function allowance_is_valid_payout(
  p_frequency text, p_payout_day integer, p_payout_weekday integer, p_payout_date date
) returns boolean language sql immutable as $$
  select case
    when p_frequency = 'weekly' then
      p_payout_weekday is not null
      and extract(isodow from p_payout_date)::integer = p_payout_weekday
    else
      p_payout_day is not null
      and p_payout_date = allowance_payout_date(
        extract(year from p_payout_date)::integer,
        extract(month from p_payout_date)::integer,
        p_payout_day
      )
  end;
$$;

create or replace function allowance_cycle_period_start(
  p_frequency text, p_payout_day integer, p_payout_date date
) returns date language sql immutable as $$
  select case
    when p_frequency = 'weekly' then p_payout_date - 7
    else allowance_previous_payout(p_payout_date, p_payout_day)
  end;
$$;

-- ============================================================
-- Plan writes
-- ============================================================

-- The RPC names below keep their original "monthly" spelling on purpose: this
-- is an installed PWA, so a cached client may still call them after deploy.
-- They settle whatever frequency the plan carries.

create or replace function save_allowance_plan(target_plan_id uuid, plan_data jsonb, requirements_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  saved_plan_id uuid;
  fid uuid;
  requirement jsonb;
  mode text;
  v_frequency text;
  v_payout_day smallint;
  v_payout_weekday smallint;
  v_note text;
begin
  mode := plan_data->>'condition_mode';
  -- Callers predating this migration send no frequency and mean monthly.
  v_frequency := coalesce(plan_data->>'frequency', 'monthly');
  if v_frequency not in ('weekly', 'monthly') then raise exception 'Invalid allowance frequency'; end if;
  -- Normalized here rather than trusted from the client, so the schedule
  -- constraint cannot be tripped by a stray field.
  if v_frequency = 'weekly' then
    v_payout_day := null;
    v_payout_weekday := nullif(plan_data->>'payout_weekday', '')::smallint;
    if v_payout_weekday is null then raise exception 'Weekly allowance requires a payout weekday'; end if;
  else
    v_payout_weekday := null;
    v_payout_day := nullif(plan_data->>'payout_day', '')::smallint;
    if v_payout_day is null then raise exception 'Monthly allowance requires a payout day'; end if;
  end if;
  v_note := nullif(btrim(coalesce(plan_data->>'note', '')), '');

  if target_plan_id is null then
    fid := (plan_data->>'family_id')::uuid;
    if not is_family_parent(fid) then raise exception 'Not authorized'; end if;
    insert into allowance_plans (
      family_id, member_id, amount, frequency, payout_day, payout_weekday, note,
      starts_on, status, condition_mode, created_by
    ) values (
      fid, (plan_data->>'member_id')::uuid, (plan_data->>'amount')::numeric,
      v_frequency, v_payout_day, v_payout_weekday, v_note,
      (plan_data->>'starts_on')::date,
      coalesce(plan_data->>'status', 'active'), mode, auth.uid()
    ) returning id into saved_plan_id;
  else
    select family_id into fid from allowance_plans where id = target_plan_id for update;
    if fid is null then raise exception 'Allowance plan not found'; end if;
    if not is_family_parent(fid) then raise exception 'Not authorized'; end if;
    update allowance_plans set
      member_id = (plan_data->>'member_id')::uuid,
      amount = (plan_data->>'amount')::numeric,
      frequency = v_frequency,
      payout_day = v_payout_day,
      payout_weekday = v_payout_weekday,
      note = v_note,
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

-- Settled cycles reference the plan (on delete restrict) and back real ledger
-- entries, so a plan that has ever paid out is archived rather than removed.
-- Archiving already hides it everywhere and frees the one-open-plan slot.
create or replace function delete_allowance_plan(target_plan_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from allowance_plans where id = target_plan_id for update;
  if fid is null then raise exception 'Allowance plan not found'; end if;
  if not is_family_parent(fid) then raise exception 'Not authorized'; end if;
  if exists (select 1 from allowance_cycles where plan_id = target_plan_id) then
    update allowance_plans set status = 'archived', updated_at = now() where id = target_plan_id;
    return 'archived';
  end if;
  delete from allowance_plan_requirements where plan_id = target_plan_id;
  delete from allowance_plans where id = target_plan_id;
  return 'deleted';
end;
$$;

-- ============================================================
-- Settlement
-- ============================================================

create or replace function credit_monthly_allowance(plan_id uuid, payout_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p allowance_plans%rowtype;
  period_start date;
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
  if not allowance_is_valid_payout(p.frequency, p.payout_day, p.payout_weekday, payout_date)
    or payout_date < p.starts_on then raise exception 'Invalid payout date'; end if;
  if payout_date > current_date then raise exception 'Allowance cycle is not due'; end if;
  period_start := greatest(allowance_cycle_period_start(p.frequency, p.payout_day, payout_date), p.starts_on);
  if p.condition_mode = 'chores' and (
    not exists (select 1 from allowance_plan_requirements r where r.plan_id = p.id)
    or not allowance_requirements_met(p.id, p.member_id, period_start, payout_date)
  ) then raise exception 'Allowance requirements are not met'; end if;

  insert into allowance_cycles (plan_id, payout_date, period_start, period_end, status, credited_amount, created_by)
  values (p.id, payout_date, period_start, payout_date, 'credited', p.amount, auth.uid())
  returning id into cycle_id;
  -- entry_type stays 'monthly_allowance': it is the historical value for every
  -- allowance credit, and rewriting settled ledger rows to re-label them would
  -- be a financial-history change, not a schema fix.
  insert into allowance_ledger (family_id, member_id, amount, reason, entry_type, source_allowance_cycle_id, created_by)
  values (p.family_id, p.member_id, p.amount, 'Allowance', 'monthly_allowance', cycle_id, auth.uid())
  returning id into ledger_id;
  update allowance_cycles set ledger_entry_id = ledger_id where id = cycle_id;
  return cycle_id;
exception when unique_violation then
  raise exception 'Allowance cycle is already settled';
end;
$$;

create or replace function skip_monthly_allowance(plan_id uuid, payout_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare p allowance_plans%rowtype; cycle_id uuid; period_start date;
begin
  select * into p from allowance_plans where id = plan_id for update;
  if p.id is null then raise exception 'Allowance plan not found'; end if;
  if not is_family_parent(p.family_id) then raise exception 'Not authorized'; end if;
  if not allowance_is_valid_payout(p.frequency, p.payout_day, p.payout_weekday, payout_date)
    or payout_date < p.starts_on or payout_date > current_date then raise exception 'Invalid payout date'; end if;
  period_start := greatest(allowance_cycle_period_start(p.frequency, p.payout_day, payout_date), p.starts_on);
  insert into allowance_cycles (plan_id, payout_date, period_start, period_end, status, credited_amount, created_by)
  values (p.id, payout_date, period_start, payout_date, 'skipped', null, auth.uid()) returning id into cycle_id;
  return cycle_id;
exception when unique_violation then raise exception 'Allowance cycle is already settled';
end;
$$;

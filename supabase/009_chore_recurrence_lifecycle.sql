-- Structured chore recurrence, editable/archivable definitions, immutable
-- occurrence snapshots, and atomic approval scheduling.
-- Run after 008_allowance_plans_family_events.sql.

-- ============================================================
-- Chore definition and legacy migration
-- ============================================================

alter table chores add column recurrence_type text;
alter table chores add column recurrence_weekdays smallint[];
alter table chores add column preferred_day_of_month smallint;
alter table chores add column status text;
alter table chores add column updated_at timestamptz;

-- The former boolean carries no cadence. Weekly, anchored to the existing
-- due date, is the safest non-destructive structured interpretation.
update chores
set recurrence_type = case when recurring then 'weekly' else 'none' end,
    status = 'active',
    updated_at = created_at;

-- Carry forward the old UI's notion of a completed one-off chore.
update chores c
set status = 'archived'
where c.recurrence_type = 'none'
  and (
    select cc.status
    from chore_completions cc
    where cc.chore_id = c.id
    order by cc.completed_at desc, cc.id desc
    limit 1
  ) = 'approved';

alter table chores alter column recurrence_type set default 'none';
alter table chores alter column recurrence_type set not null;
alter table chores add constraint chores_recurrence_type_check
  check (recurrence_type in ('none', 'daily', 'weekly', 'monthly'));
alter table chores add constraint chores_recurrence_weekdays_check
  check (
    (recurrence_type = 'daily' and recurrence_weekdays is not null and cardinality(recurrence_weekdays) > 0)
    or (recurrence_type <> 'daily' and recurrence_weekdays is null)
  );
alter table chores add constraint chores_preferred_day_check
  check (
    (recurrence_type = 'monthly' and preferred_day_of_month is not null and preferred_day_of_month between 1 and 31)
    or (recurrence_type <> 'monthly' and preferred_day_of_month is null)
  );

alter table chores alter column status set default 'active';
alter table chores alter column status set not null;
alter table chores add constraint chores_status_check check (status in ('active', 'archived'));
alter table chores alter column updated_at set default now();
alter table chores alter column updated_at set not null;

create index chores_family_status_due_idx on chores (family_id, status, due_date);

-- Parents may edit definitions. Deletes intentionally remain unavailable:
-- archiving preserves completion and allowance history.
create policy "update chores in own family"
  on chores for update
  using (is_family_parent(family_id))
  with check (
    is_family_parent(family_id)
    and exists (
      select 1 from members m
      where m.id = chores.assigned_to and m.family_id = chores.family_id
    )
  );

create or replace function validate_chore_definition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Compatibility for an older client that still writes only recurring.
  if tg_op = 'INSERT' and new.recurring and new.recurrence_type = 'none' then
    new.recurrence_type := 'weekly';
  elsif tg_op = 'UPDATE'
    and new.recurring is distinct from old.recurring
    and new.recurrence_type is not distinct from old.recurrence_type then
    new.recurrence_type := case when new.recurring then 'weekly' else 'none' end;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1 from chore_completions cc
    where cc.chore_id = old.id and cc.status = 'pending_approval'
  ) and (
    new.assigned_to is distinct from old.assigned_to
    or new.due_date is distinct from old.due_date
    or new.reward_amount is distinct from old.reward_amount
    or new.recurrence_type is distinct from old.recurrence_type
    or new.recurrence_weekdays is distinct from old.recurrence_weekdays
    or new.preferred_day_of_month is distinct from old.preferred_day_of_month
    or new.status is distinct from old.status
  ) then
    raise exception 'Scheduling, reward, assignee, and status cannot change while completion is pending';
  end if;

  if new.recurrence_type = 'daily' then
    if new.recurrence_weekdays is null or cardinality(new.recurrence_weekdays) = 0 then
      raise exception 'Daily recurrence requires at least one weekday';
    end if;
    if exists (
      select 1 from unnest(new.recurrence_weekdays) as weekdays(day_value)
      where day_value is null or day_value < 1 or day_value > 7
    ) then
      raise exception 'Recurrence weekdays must use ISO values 1 through 7';
    end if;
    new.recurrence_weekdays := array(
      select distinct day_value
      from unnest(new.recurrence_weekdays) as weekdays(day_value)
      order by day_value
    );
  else
    new.recurrence_weekdays := null;
  end if;

  if new.recurrence_type = 'monthly' then
    new.preferred_day_of_month := coalesce(
      new.preferred_day_of_month,
      extract(day from new.due_date)::smallint
    );
    if new.preferred_day_of_month < 1 or new.preferred_day_of_month > 31 then
      raise exception 'Preferred day of month must be between 1 and 31';
    end if;
  else
    new.preferred_day_of_month := null;
  end if;

  new.recurring := new.recurrence_type <> 'none';
  new.updated_at := now();
  return new;
end;
$$;

create trigger chore_definition_guard
  before insert or update on chores
  for each row execute function validate_chore_definition();

-- ============================================================
-- Immutable completion/occurrence history
-- ============================================================

alter table chore_completions add column occurrence_due_date date;
alter table chore_completions add column chore_title text;
alter table chore_completions add column reward_amount numeric(10,2);

-- Older completions predate occurrence snapshots. The current definition is
-- the only available source, so preserve that best-known value without
-- deleting or recreating historical rows.
update chore_completions cc
set occurrence_due_date = c.due_date,
    chore_title = c.title,
    reward_amount = c.reward_amount
from chores c
where c.id = cc.chore_id;

alter table chore_completions alter column occurrence_due_date set not null;
alter table chore_completions alter column chore_title set not null;
alter table chore_completions alter column reward_amount set not null;

-- Preserve any legacy duplicate rows but resolve ambiguous pending state by
-- keeping the earliest request pending and marking later requests rejected.
with ranked_pending as (
  select id, row_number() over (partition by chore_id order by completed_at, id) as position
  from chore_completions
  where status = 'pending_approval'
)
update chore_completions cc
set status = 'rejected', approved_at = coalesce(cc.approved_at, now())
from ranked_pending ranked
where cc.id = ranked.id and ranked.position > 1;

create unique index chore_completions_one_pending_per_chore_idx
  on chore_completions (chore_id) where status = 'pending_approval';
create index chore_completions_chore_occurrence_idx
  on chore_completions (chore_id, occurrence_due_date desc, completed_at desc);

create or replace function prepare_chore_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  definition chores%rowtype;
begin
  select * into definition from chores where id = new.chore_id for update;
  if definition.id is null then raise exception 'Chore not found'; end if;
  if definition.status <> 'active' then raise exception 'Archived chore cannot be completed'; end if;
  if new.completed_by <> definition.assigned_to then raise exception 'Completion member must match chore assignee'; end if;
  if new.status <> 'pending_approval' then raise exception 'New completion must wait for approval'; end if;
  if exists (
    select 1 from chore_completions cc
    where cc.chore_id = new.chore_id and cc.status = 'pending_approval'
  ) then
    raise exception 'Chore completion is already pending approval';
  end if;

  new.occurrence_due_date := definition.due_date;
  new.chore_title := definition.title;
  new.reward_amount := definition.reward_amount;
  new.approved_by := null;
  new.approved_at := null;
  return new;
end;
$$;

create trigger chore_completion_snapshot
  before insert on chore_completions
  for each row execute function prepare_chore_completion();

-- ============================================================
-- Recurrence calculation and atomic approval lifecycle
-- ============================================================

create or replace function get_next_chore_due_date(
  p_recurrence_type text,
  p_current_due_date date,
  p_completed_on date,
  p_recurrence_weekdays smallint[],
  p_preferred_day_of_month smallint
) returns date language plpgsql immutable set search_path = public as $$
declare
  candidate date := p_current_due_date;
  first_of_next_month date;
  last_of_next_month date;
  preferred_day smallint := coalesce(p_preferred_day_of_month, extract(day from p_current_due_date)::smallint);
  step_count integer;
begin
  if p_recurrence_type = 'none' then return null; end if;
  if p_recurrence_type not in ('daily', 'weekly', 'monthly') then
    raise exception 'Unsupported chore recurrence type';
  end if;
  if p_recurrence_type = 'daily' and coalesce(cardinality(p_recurrence_weekdays), 0) = 0 then
    raise exception 'Daily recurrence requires weekdays';
  end if;

  for step_count in 1..4000 loop
    if p_recurrence_type = 'daily' then
      candidate := candidate + 1;
      if not (extract(isodow from candidate)::smallint = any(p_recurrence_weekdays)) then
        continue;
      end if;
    elsif p_recurrence_type = 'weekly' then
      candidate := candidate + 7;
    else
      first_of_next_month := (date_trunc('month', candidate)::date + interval '1 month')::date;
      last_of_next_month := (first_of_next_month + interval '1 month - 1 day')::date;
      candidate := make_date(
        extract(year from first_of_next_month)::integer,
        extract(month from first_of_next_month)::integer,
        least(preferred_day, extract(day from last_of_next_month)::smallint)
      );
    end if;

    if candidate > p_current_due_date and candidate >= p_completed_on then
      return candidate;
    end if;
  end loop;
  raise exception 'Unable to calculate next chore due date';
end;
$$;

drop function if exists approve_chore_completion(uuid);

create function approve_chore_completion(completion_id uuid, approval_date date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  completion chore_completions%rowtype;
  definition chores%rowtype;
  approver_id uuid;
  ledger_id uuid;
  next_due_date date;
begin
  select * into completion
  from chore_completions
  where id = completion_id
  for update;
  if completion.id is null then raise exception 'Completion not found'; end if;

  select * into definition
  from chores
  where id = completion.chore_id
  for update;
  if definition.id is null then raise exception 'Chore not found'; end if;
  if not is_family_parent(definition.family_id) then
    raise exception 'Not authorized to approve this completion';
  end if;
  if completion.status <> 'pending_approval' then
    raise exception 'Completion is not pending approval';
  end if;

  select id into approver_id
  from members
  where family_id = definition.family_id and user_id = auth.uid();

  update chore_completions
  set status = 'approved', approved_by = approver_id, approved_at = now()
  where id = completion_id;

  insert into allowance_ledger (
    family_id, member_id, amount, reason, entry_type,
    source_chore_completion_id, created_by
  ) values (
    definition.family_id, completion.completed_by, completion.reward_amount,
    completion.chore_title, 'chore_reward', completion_id, auth.uid()
  ) returning id into ledger_id;

  if definition.recurrence_type = 'none' then
    update chores set status = 'archived' where id = definition.id;
  else
    next_due_date := get_next_chore_due_date(
      definition.recurrence_type,
      completion.occurrence_due_date,
      coalesce(approval_date, current_date),
      definition.recurrence_weekdays,
      definition.preferred_day_of_month
    );
    update chores set due_date = next_due_date where id = definition.id;
  end if;

  return jsonb_build_object(
    'ledger_id', ledger_id,
    'next_due_date', next_due_date,
    'chore_id', definition.id
  );
end;
$$;

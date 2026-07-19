-- Durable and idempotent creation of calendar records queued by the PWA.
-- The client-generated record UUID becomes the canonical server UUID; the
-- separate operation UUID protects retries that happen after the insert was
-- committed but before the refreshed snapshot reached the device.

create table if not exists public.calendar_sync_operations (
  operation_id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  local_id uuid not null,
  record_type text not null check (record_type in ('create_chore', 'create_activity')),
  created_by uuid not null references auth.users(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (family_id, record_type, local_id)
);

alter table public.calendar_sync_operations enable row level security;
-- No direct policies: authenticated clients can only use the guarded RPC.

create index if not exists calendar_sync_operations_family_created_idx
  on public.calendar_sync_operations (family_id, created_at desc);

create or replace function public.apply_calendar_mutation(
  p_operation_id uuid,
  p_family_id uuid,
  p_record_type text,
  p_local_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.members%rowtype;
  existing_operation public.calendar_sync_operations%rowtype;
  participant_ids uuid[];
  participant_id uuid;
  result_payload jsonb;
  clean_title text;
begin
  if p_operation_id is null or p_family_id is null or p_local_id is null then
    raise exception 'Calendar mutation identifiers are required';
  end if;
  if p_record_type not in ('create_chore', 'create_activity') then
    raise exception 'Unsupported calendar mutation type';
  end if;

  -- Serialize duplicate deliveries of the same operation inside Postgres.
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into existing_operation
  from public.calendar_sync_operations
  where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    if existing_operation.family_id <> p_family_id
      or existing_operation.local_id <> p_local_id
      or existing_operation.record_type <> p_record_type then
      raise exception 'Calendar operation identifier was reused with different data';
    end if;
    return existing_operation.result;
  end if;

  select * into actor
  from public.members
  where family_id = p_family_id
    and user_id = auth.uid()
    and coalesce(status, 'active') = 'active'
    and role in ('admin', 'parent')
  limit 1;
  if actor.id is null then
    raise exception 'Active adult membership required';
  end if;

  clean_title := btrim(coalesce(p_payload->>'title', ''));
  if clean_title = '' then raise exception 'Calendar record title is required'; end if;

  if p_record_type = 'create_chore' then
    if nullif(p_payload->>'assignedTo', '') is not null and not exists (
      select 1 from public.members
      where id = (p_payload->>'assignedTo')::uuid
        and family_id = p_family_id
        and coalesce(status, 'active') = 'active'
    ) then raise exception 'Task assignee must be an active household member'; end if;

    if exists (select 1 from public.chores where id = p_local_id and family_id <> p_family_id) then
      raise exception 'Calendar local identifier already belongs to another household';
    end if;

    insert into public.chores (
      id, family_id, title, description, assigned_to, due_date,
      reward_amount, reward_enabled, reward_currency, requires_approval,
      category, priority, recurring, recurrence_type, recurrence_weekdays,
      preferred_day_of_month, status, sort_order, created_by, created_by_member_id
    ) values (
      p_local_id,
      p_family_id,
      clean_title,
      nullif(btrim(coalesce(p_payload->>'description', '')), ''),
      nullif(p_payload->>'assignedTo', '')::uuid,
      nullif(p_payload->>'dueDate', '')::date,
      case when coalesce((p_payload->>'rewardEnabled')::boolean, false)
        then coalesce((p_payload->>'rewardAmount')::numeric, 0) else 0 end,
      coalesce((p_payload->>'rewardEnabled')::boolean, false),
      coalesce(nullif(p_payload->>'rewardCurrency', ''), 'CZK'),
      coalesce((p_payload->>'requiresApproval')::boolean, false),
      nullif(p_payload->>'category', ''),
      coalesce(nullif(p_payload->>'priority', ''), 'normal'),
      nullif(p_payload->>'dueDate', '') is not null and coalesce(p_payload->>'recurrenceType', 'none') <> 'none',
      case when nullif(p_payload->>'dueDate', '') is null then 'none' else coalesce(p_payload->>'recurrenceType', 'none') end,
      case when nullif(p_payload->>'dueDate', '') is not null and p_payload->>'recurrenceType' = 'daily'
        then array(select value::smallint from jsonb_array_elements_text(coalesce(p_payload->'recurrenceWeekdays', '[]'::jsonb)) value)
        else null end,
      case when nullif(p_payload->>'dueDate', '') is not null and p_payload->>'recurrenceType' = 'monthly'
        then (p_payload->>'preferredDayOfMonth')::smallint else null end,
      'active',
      0,
      auth.uid(),
      actor.id
    ) on conflict (id) do nothing;

    result_payload := jsonb_build_object('recordType', 'chore', 'id', p_local_id);
  else
    select coalesce(array_agg(value::uuid), array[]::uuid[]) into participant_ids
    from jsonb_array_elements_text(coalesce(p_payload->'participantIds', '[]'::jsonb)) value;
    if coalesce(array_length(participant_ids, 1), 0) = 0 then
      raise exception 'At least one activity participant is required';
    end if;
    if exists (
      select 1 from unnest(participant_ids) participant
      left join public.members member on member.id = participant
      where member.id is null
        or member.family_id <> p_family_id
        or coalesce(member.status, 'active') <> 'active'
    ) then raise exception 'Activity participants must be active household members'; end if;
    if nullif(p_payload->>'responsibleMemberId', '') is not null and not exists (
      select 1 from public.members where id = (p_payload->>'responsibleMemberId')::uuid and family_id = p_family_id and coalesce(status, 'active') = 'active'
    ) then raise exception 'Responsible member must belong to the household'; end if;
    if nullif(p_payload->>'secondaryResponsibleMemberId', '') is not null and not exists (
      select 1 from public.members where id = (p_payload->>'secondaryResponsibleMemberId')::uuid and family_id = p_family_id and coalesce(status, 'active') = 'active'
    ) then raise exception 'Secondary responsible member must belong to the household'; end if;

    if exists (select 1 from public.activities where id = p_local_id and family_id <> p_family_id) then
      raise exception 'Calendar local identifier already belongs to another household';
    end if;

    insert into public.activities (
      id, family_id, title, category, kind, all_day, child_id,
      responsible_member_id, secondary_responsible_member_id, location,
      coach_name, coach_phone, coach_email, notes, skill_level,
      start_date, end_date, recurrence_type, recurrence_weekdays,
      start_time, end_time, payment_amount, payment_frequency,
      next_payment_due_date, status, reminder_enabled, reminder_days_before,
      created_by
    ) values (
      p_local_id,
      p_family_id,
      clean_title,
      coalesce(nullif(p_payload->>'category', ''), 'other'),
      coalesce(nullif(p_payload->>'kind', ''), 'club'),
      coalesce((p_payload->>'allDay')::boolean, false),
      participant_ids[1],
      nullif(p_payload->>'responsibleMemberId', '')::uuid,
      nullif(p_payload->>'secondaryResponsibleMemberId', '')::uuid,
      nullif(btrim(coalesce(p_payload->>'location', '')), ''),
      nullif(btrim(coalesce(p_payload->>'coachName', '')), ''),
      nullif(btrim(coalesce(p_payload->>'coachPhone', '')), ''),
      nullif(btrim(coalesce(p_payload->>'coachEmail', '')), ''),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      nullif(btrim(coalesce(p_payload->>'skillLevel', '')), ''),
      (p_payload->>'startDate')::date,
      nullif(p_payload->>'endDate', '')::date,
      coalesce(nullif(p_payload->>'recurrenceType', ''), 'one_off'),
      case when p_payload->>'recurrenceType' = 'custom_weekdays'
        then array(select value::smallint from jsonb_array_elements_text(coalesce(p_payload->'recurrenceWeekdays', '[]'::jsonb)) value)
        else null end,
      case when coalesce((p_payload->>'allDay')::boolean, false) then null else nullif(p_payload->>'startTime', '')::time end,
      case when coalesce((p_payload->>'allDay')::boolean, false) then null else nullif(p_payload->>'endTime', '')::time end,
      nullif(p_payload->>'paymentAmount', '')::numeric,
      nullif(p_payload->>'paymentFrequency', ''),
      nullif(p_payload->>'nextPaymentDueDate', '')::date,
      coalesce(nullif(p_payload->>'status', ''), 'active'),
      coalesce((p_payload->>'reminderEnabled')::boolean, false),
      nullif(p_payload->>'reminderDaysBefore', '')::smallint,
      auth.uid()
    ) on conflict (id) do nothing;

    foreach participant_id in array participant_ids loop
      insert into public.activity_participants (activity_id, member_id)
      values (p_local_id, participant_id)
      on conflict do nothing;
    end loop;
    result_payload := jsonb_build_object('recordType', 'activity', 'id', p_local_id);
  end if;

  insert into public.calendar_sync_operations (
    operation_id, family_id, local_id, record_type, created_by, result
  ) values (
    p_operation_id, p_family_id, p_local_id, p_record_type, auth.uid(), result_payload
  ) on conflict (family_id, record_type, local_id) do update
    set result = excluded.result
  returning result into result_payload;

  return result_payload;
end;
$$;

revoke all on function public.apply_calendar_mutation(uuid, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.apply_calendar_mutation(uuid, uuid, text, uuid, jsonb) to authenticated;

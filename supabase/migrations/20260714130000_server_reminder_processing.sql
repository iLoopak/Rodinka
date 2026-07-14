-- Phase 4.1 PR1: durable server processing, planned-delivery outbox and cron boundary.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

alter table notification_preferences
  add column locale text not null default 'cs'
  check (locale in ('cs','en'));

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  target_member_id uuid not null references members(id) on delete cascade,
  reminder_id uuid references reminders(id) on delete set null,
  reminder_dedupe_key text,
  delivery_type text not null check (delivery_type in ('immediate','daily_digest','weekly_digest')),
  channel text not null default 'planned' check (channel in ('planned','push')),
  grouping_key text,
  title text not null,
  body text,
  deep_link text,
  importance text not null check (importance in ('quiet','normal','important')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processing_started_at timestamptz,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(idempotency_key) <> ''),
  check (btrim(title) <> '' and length(title) <= 180),
  check (body is null or length(body) <= 800),
  check (deep_link is null or length(deep_link) <= 500)
);

create index notification_deliveries_due_idx
  on notification_deliveries(status, scheduled_for, next_attempt_at)
  where status in ('pending','failed');
create index notification_deliveries_member_idx
  on notification_deliveries(target_member_id, created_at desc);
create index notification_deliveries_reminder_idx
  on notification_deliveries(reminder_id)
  where reminder_id is not null and status in ('pending','processing');

create table notification_processing_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  users_processed integer not null default 0,
  households_processed integer not null default 0,
  reminders_created integer not null default 0,
  reminders_updated integer not null default 0,
  reminders_resolved integer not null default 0,
  deliveries_created integer not null default 0,
  deliveries_cancelled integer not null default 0,
  skipped_users integer not null default 0,
  warnings_count integer not null default 0,
  errors_count integer not null default 0,
  continuation_cursor uuid,
  error_summary text,
  created_at timestamptz not null default now(),
  check (error_summary is null or length(error_summary) <= 1000)
);

create index notification_processing_runs_started_idx
  on notification_processing_runs(started_at desc);

create table notification_processing_state (
  member_id uuid primary key references members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  last_processed_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);

create index notification_processing_state_fairness_idx
  on notification_processing_state(last_processed_at nulls first, member_id);

create trigger validate_notification_processing_state_owner
before insert or update on notification_processing_state
for each row execute function validate_notification_owner();

alter table notification_deliveries enable row level security;
alter table notification_processing_runs enable row level security;
alter table notification_processing_state enable row level security;
-- Intentionally no user policies: PR1 has no delivery-history UI. Only the
-- service role can read or mutate the outbox and privacy-safe diagnostics.

revoke all on table notification_deliveries from anon, authenticated;
revoke all on table notification_processing_runs from anon, authenticated;
revoke all on table notification_processing_state from anon, authenticated;
grant all on table notification_deliveries to service_role;
grant all on table notification_processing_runs to service_role;
grant all on table notification_processing_state to service_role;

create or replace function validate_notification_delivery_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from members m
    where m.id = new.target_member_id
      and m.family_id = new.family_id
      and m.user_id = new.user_id
  ) then
    raise exception 'Delivery recipient must be the linked member in this family';
  end if;
  if new.reminder_id is not null and not exists (
    select 1 from reminders r
    where r.id = new.reminder_id
      and r.family_id = new.family_id
      and r.target_member_id = new.target_member_id
  ) then
    raise exception 'Delivery reminder must belong to the recipient';
  end if;
  return new;
end;
$$;

revoke all on function validate_notification_delivery_owner() from public;
create trigger validate_notification_delivery_owner_trigger
before insert or update of user_id, family_id, target_member_id, reminder_id on notification_deliveries
for each row execute function validate_notification_delivery_owner();

-- Meal-plan-empty is the one valid reminder without a persisted source row.
-- All other live sources must still be real UUIDs from this family.
create or replace function reminder_sources_belong_to_family(
  p_family_id uuid,
  p_source text,
  p_metadata jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  source_count integer;
  invalid_uuid boolean;
begin
  if jsonb_typeof(p_metadata->'sourceIds') <> 'array' then return false; end if;
  select count(*), coalesce(bool_or(value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'), false)
    into source_count, invalid_uuid
  from jsonb_array_elements_text(p_metadata->'sourceIds');
  if p_source = 'meal-plan' and source_count = 0 then return true; end if;
  if p_source = 'document' or source_count < 1 or source_count > 250 or invalid_uuid then return false; end if;

  if p_source = 'chore' then
    return not exists (select 1 from jsonb_array_elements_text(p_metadata->'sourceIds') i where not exists (select 1 from chores x where x.id = i::uuid and x.family_id = p_family_id));
  elsif p_source in ('activity','activity-payment') then
    return not exists (select 1 from jsonb_array_elements_text(p_metadata->'sourceIds') i where not exists (select 1 from activities x where x.id = i::uuid and x.family_id = p_family_id));
  elsif p_source in ('medical-appointment','vaccination') then
    return not exists (select 1 from jsonb_array_elements_text(p_metadata->'sourceIds') i where not exists (select 1 from medical_records x where x.id = i::uuid and x.family_id = p_family_id));
  elsif p_source = 'voting' then
    return not exists (select 1 from jsonb_array_elements_text(p_metadata->'sourceIds') i where not exists (select 1 from meal_vote_rounds x where x.id = i::uuid and x.family_id = p_family_id));
  elsif p_source = 'meal-plan' then
    return not exists (select 1 from jsonb_array_elements_text(p_metadata->'sourceIds') i where not exists (select 1 from meal_plan_entries x where x.id = i::uuid and x.family_id = p_family_id));
  elsif p_source = 'allowance' then
    return not exists (
      select 1 from jsonb_array_elements_text(p_metadata->'sourceIds') i
      where not exists (select 1 from chore_completions x join chores c on c.id = x.chore_id where x.id = i::uuid and c.family_id = p_family_id)
    );
  elsif p_source = 'shopping' then
    return not exists (select 1 from jsonb_array_elements_text(p_metadata->'sourceIds') i where not exists (select 1 from shopping_items x where x.id = i::uuid and x.family_id = p_family_id));
  end if;
  return false;
end;
$$;

revoke all on function reminder_sources_belong_to_family(uuid, text, jsonb) from public;

create or replace function get_reminder_processing_targets(
  p_cursor uuid default null,
  p_batch_size integer default 50,
  p_family_id uuid default null,
  p_user_id uuid default null,
  p_fair_queue boolean default false
)
returns table(member_id uuid, family_id uuid, user_id uuid, display_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if p_batch_size < 1 or p_batch_size > 100 then raise exception 'Batch size must be 1..100'; end if;
  return query
  select m.id, m.family_id, m.user_id, m.display_name, m.role
  from members m
  left join notification_processing_state s on s.member_id = m.id
  where m.user_id is not null
    and (p_family_id is null or m.family_id = p_family_id)
    and (p_user_id is null or m.user_id = p_user_id)
    and (p_fair_queue or p_cursor is null or m.id > p_cursor)
  order by
    case when p_fair_queue then s.last_processed_at end asc nulls first,
    m.id asc
  limit p_batch_size;
end;
$$;

revoke all on function get_reminder_processing_targets(uuid, integer, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function get_reminder_processing_targets(uuid, integer, uuid, uuid, boolean) to service_role;

create or replace function get_reminder_source_snapshot(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if not exists (select 1 from families where id = p_family_id) then raise exception 'Family not found'; end if;
  if (select count(*) from chores where family_id = p_family_id and status = 'active') > 1000
    or (select count(*) from activities where family_id = p_family_id and status = 'active') > 1000
    or (select count(*) from medical_records where family_id = p_family_id and status <> 'cancelled') > 1000
    or (select count(*) from shopping_items where family_id = p_family_id and purchased = false and archived_at is null) > 2000
  then raise exception 'Reminder source limit exceeded'; end if;

  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'family_id', m.family_id, 'display_name', m.display_name, 'role', m.role, 'user_id', m.user_id
    )) from members m where m.family_id = p_family_id), '[]'::jsonb),
    'chores', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'family_id', c.family_id, 'title', c.title, 'description', c.description,
      'assigned_to', c.assigned_to, 'due_date', c.due_date, 'reward_amount', c.reward_amount,
      'recurring', c.recurring, 'recurrence_type', c.recurrence_type, 'recurrence_weekdays', c.recurrence_weekdays,
      'preferred_day_of_month', c.preferred_day_of_month, 'status', c.status, 'created_at', c.created_at, 'updated_at', c.updated_at
    )) from chores c where c.family_id = p_family_id and c.status = 'active'), '[]'::jsonb),
    'completions', coalesce((
      select jsonb_agg(to_jsonb(latest)) from (
        select distinct on (cc.chore_id) cc.id, cc.chore_id, cc.completed_by, cc.completed_at, cc.status,
          cc.approved_by, cc.approved_at, cc.occurrence_due_date, cc.chore_title, cc.reward_amount
        from chore_completions cc join chores c on c.id = cc.chore_id
        where c.family_id = p_family_id and c.status = 'active'
        order by cc.chore_id, cc.completed_at desc, cc.id desc
      ) latest
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'family_id', a.family_id, 'title', a.title, 'child_id', a.child_id,
        'responsible_member_id', a.responsible_member_id, 'start_date', a.start_date, 'end_date', a.end_date,
        'recurrence_type', a.recurrence_type, 'recurrence_weekdays', a.recurrence_weekdays,
        'next_payment_due_date', a.next_payment_due_date, 'payment_paid_at', a.payment_paid_at,
        'payment_paid_for_date', a.payment_paid_for_date, 'status', a.status,
        'reminder_enabled', a.reminder_enabled, 'reminder_days_before', a.reminder_days_before,
        'created_at', a.created_at, 'updated_at', a.updated_at,
        'participant_ids', coalesce((select jsonb_agg(ap.member_id) from activity_participants ap where ap.activity_id = a.id), '[]'::jsonb)
      ))
      from activities a where a.family_id = p_family_id and a.status = 'active'
    ), '[]'::jsonb),
    'medicalRecords', coalesce((select jsonb_agg(jsonb_build_object(
      'id', mr.id, 'family_id', mr.family_id, 'patient_id', mr.patient_id,
      'responsible_member_id', mr.responsible_member_id, 'record_type', mr.record_type,
      'record_date', mr.record_date, 'status', mr.status, 'vaccine_next_dose_date', mr.vaccine_next_dose_date,
      'created_at', mr.created_at, 'updated_at', mr.updated_at
    )) from medical_records mr where mr.family_id = p_family_id and mr.status <> 'cancelled'), '[]'::jsonb),
    'voteRounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vr.id, 'family_id', vr.family_id, 'title', vr.title, 'status', vr.status,
        'deadline_at', vr.deadline_at, 'created_at', vr.created_at, 'closed_at', vr.closed_at,
        'candidates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', vc.id, 'round_id', vc.round_id, 'meal_id', vc.meal_id, 'meal_title', vc.meal_title,
          'created_at', vc.created_at, 'votes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', mv.id, 'candidate_id', mv.candidate_id, 'member_id', mv.member_id,
            'value', mv.value, 'created_at', mv.created_at, 'updated_at', mv.updated_at
          )) from meal_votes mv where mv.candidate_id = vc.id), '[]'::jsonb)
        ))
        from meal_vote_candidates vc where vc.round_id = vr.id
      ), '[]'::jsonb)))
      from meal_vote_rounds vr
      where vr.family_id = p_family_id and vr.status = 'open' and vr.deadline_at between now() - interval '1 hour' and now() + interval '49 hours'
    ), '[]'::jsonb),
    'planEntries', coalesce((select jsonb_agg(jsonb_build_object(
      'id', mp.id, 'family_id', mp.family_id, 'entry_date', mp.entry_date,
      'meal_slot', mp.meal_slot, 'status', mp.status, 'updated_at', mp.updated_at
    )) from meal_plan_entries mp where mp.family_id = p_family_id and mp.entry_date between current_date - 1 and current_date + 2), '[]'::jsonb),
    'pendingCompletions', coalesce((
      select jsonb_agg(jsonb_build_object('id', cc.id, 'chore_id', cc.chore_id, 'completed_by', cc.completed_by,
        'completed_at', cc.completed_at, 'status', cc.status, 'approved_by', cc.approved_by, 'approved_at', cc.approved_at,
        'occurrence_due_date', cc.occurrence_due_date, 'chore_title', cc.chore_title, 'reward_amount', cc.reward_amount))
      from chore_completions cc join chores c on c.id = cc.chore_id
      where c.family_id = p_family_id and cc.status = 'pending_approval'
    ), '[]'::jsonb),
    'shoppingItems', coalesce((select jsonb_agg(jsonb_build_object(
      'id', si.id, 'family_id', si.family_id, 'name', si.name,
      'created_by_member_id', si.created_by_member_id, 'responsible_member_id', si.responsible_member_id,
      'purchased', si.purchased, 'archived_at', si.archived_at, 'created_at', si.created_at, 'updated_at', si.updated_at
    )) from shopping_items si where si.family_id = p_family_id and si.purchased = false and si.archived_at is null), '[]'::jsonb),
    'documents', '[]'::jsonb
  ) into result;
  return result;
end;
$$;

revoke all on function get_reminder_source_snapshot(uuid) from public, anon, authenticated;
grant execute on function get_reminder_source_snapshot(uuid) to service_role;

create or replace function sync_server_member_reminders(
  p_family_id uuid,
  p_member_id uuid,
  p_reminders jsonb,
  p_deliveries jsonb,
  p_delivery_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_user_id uuid;
  existing_count integer := 0;
  changed_count integer := 0;
  created_count integer := 0;
  resolved_count integer := 0;
  deliveries_created integer := 0;
  deliveries_cancelled integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if jsonb_typeof(p_reminders) <> 'array' or jsonb_array_length(p_reminders) > 250 then raise exception 'Invalid reminder batch'; end if;
  if jsonb_typeof(p_deliveries) <> 'array' or jsonb_array_length(p_deliveries) > 250 then raise exception 'Invalid delivery batch'; end if;
  if jsonb_typeof(p_delivery_settings) <> 'object' then raise exception 'Invalid delivery settings'; end if;
  select user_id into recipient_user_id from members where id = p_member_id and family_id = p_family_id;
  if recipient_user_id is null then raise exception 'Linked recipient not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));
  select count(*) into existing_count from reminders r
  where r.target_member_id = p_member_id and exists (select 1 from jsonb_array_elements(p_reminders) i where i->>'dedupeKey' = r.dedupe_key);

  insert into reminders (
    family_id, target_member_id, dedupe_key, source, reminder_type, title, description, importance,
    event_at, generated_at, expires_at, deep_link, grouping_key, metadata, last_seen_at, updated_at
  )
  select p_family_id, p_member_id, btrim(i->>'dedupeKey'), i->>'source', i->>'type', btrim(i->>'title'),
    nullif(i->>'description',''), i->>'importance', nullif(i->>'eventAt','')::timestamptz,
    (i->>'generatedAt')::timestamptz, nullif(i->>'expiresAt','')::timestamptz, nullif(i->>'deepLink',''),
    nullif(i->>'groupingKey',''), i->'metadata', now(), now()
  from jsonb_array_elements(p_reminders) i
  where btrim(coalesce(i->>'dedupeKey','')) <> '' and length(i->>'dedupeKey') <= 240
    and btrim(coalesce(i->>'title','')) <> '' and length(i->>'title') <= 180
    and i->>'source' in ('chore','activity','activity-payment','medical-appointment','vaccination','voting','meal-plan','allowance','document','shopping')
    and i->>'importance' in ('quiet','normal','important') and jsonb_typeof(i->'metadata') = 'object'
  on conflict (target_member_id, dedupe_key) do update set
    source = excluded.source, reminder_type = excluded.reminder_type, title = excluded.title,
    description = excluded.description, importance = excluded.importance, event_at = excluded.event_at,
    generated_at = case when reminders.resolved_at is not null then excluded.generated_at else reminders.generated_at end,
    expires_at = excluded.expires_at, deep_link = excluded.deep_link, grouping_key = excluded.grouping_key,
    metadata = excluded.metadata, read_at = case when reminders.resolved_at is not null then null else reminders.read_at end,
    dismissed_at = case when reminders.resolved_at is not null then null else reminders.dismissed_at end,
    resolved_at = null, last_seen_at = now(), updated_at = now()
  where reminders.resolved_at is not null or reminders.source is distinct from excluded.source
    or reminders.reminder_type is distinct from excluded.reminder_type or reminders.title is distinct from excluded.title
    or reminders.description is distinct from excluded.description or reminders.importance is distinct from excluded.importance
    or reminders.event_at is distinct from excluded.event_at or reminders.expires_at is distinct from excluded.expires_at
    or reminders.deep_link is distinct from excluded.deep_link or reminders.grouping_key is distinct from excluded.grouping_key
    or reminders.metadata is distinct from excluded.metadata;
  get diagnostics changed_count = row_count;
  created_count := greatest(jsonb_array_length(p_reminders) - existing_count, 0);

  update reminders r set resolved_at = now(), updated_at = now()
  where r.family_id = p_family_id and r.target_member_id = p_member_id and r.resolved_at is null
    and not exists (select 1 from jsonb_array_elements(p_reminders) i where i->>'dedupeKey' = r.dedupe_key);
  get diagnostics resolved_count = row_count;

  update notification_deliveries d set status = 'cancelled', updated_at = now()
  where d.family_id = p_family_id and d.target_member_id = p_member_id and d.status in ('pending','failed')
    and ((d.reminder_id is not null and exists (select 1 from reminders r where r.id = d.reminder_id and (r.resolved_at is not null or r.dismissed_at is not null)))
      or (d.delivery_type = 'immediate' and (
        not coalesce((p_delivery_settings->>'pushEnabled')::boolean, false)
        or not exists (select 1 from jsonb_array_elements(p_deliveries) x where x->>'idempotencyKey' = d.idempotency_key)
      ))
      or (d.delivery_type = 'daily_digest' and not coalesce((p_delivery_settings->>'dailyDigestEnabled')::boolean, false))
      or (d.delivery_type = 'weekly_digest' and not coalesce((p_delivery_settings->>'weeklyDigestEnabled')::boolean, false))
      or (d.delivery_type <> 'immediate' and not exists (
        select 1 from jsonb_array_elements_text(coalesce(d.metadata->'reminderKeys','[]'::jsonb)) k
        join reminders r on r.target_member_id = p_member_id and r.dedupe_key = k.value and r.resolved_at is null and r.dismissed_at is null
      )));
  get diagnostics deliveries_cancelled = row_count;

  -- A not-yet-delivered digest keeps its identity, but its aggregate content
  -- follows partial resolution and preference-safe rescheduling.
  update notification_deliveries existing set
    title = btrim(d.item->>'title'), body = nullif(d.item->>'body',''),
    deep_link = nullif(d.item->>'deepLink',''), importance = d.item->>'importance',
    scheduled_for = (d.item->>'scheduledFor')::timestamptz,
    metadata = coalesce(d.item->'metadata','{}'::jsonb), updated_at = now()
  from jsonb_array_elements(p_deliveries) d(item)
  where existing.idempotency_key = d.item->>'idempotencyKey'
    and existing.delivery_type in ('daily_digest','weekly_digest')
    and existing.status in ('pending','failed')
    and (existing.title is distinct from btrim(d.item->>'title')
      or existing.body is distinct from nullif(d.item->>'body','')
      or existing.importance is distinct from d.item->>'importance'
      or existing.scheduled_for is distinct from (d.item->>'scheduledFor')::timestamptz
      or existing.metadata is distinct from coalesce(d.item->'metadata','{}'::jsonb));

  insert into notification_deliveries (
    user_id, family_id, target_member_id, reminder_id, reminder_dedupe_key, delivery_type, channel,
    grouping_key, title, body, deep_link, importance, scheduled_for, metadata, idempotency_key
  )
  select recipient_user_id, p_family_id, p_member_id, r.id, nullif(d->>'reminderDedupeKey',''),
    d->>'deliveryType', d->>'channel', nullif(d->>'groupingKey',''), btrim(d->>'title'), nullif(d->>'body',''),
    nullif(d->>'deepLink',''), d->>'importance', (d->>'scheduledFor')::timestamptz,
    coalesce(d->'metadata','{}'::jsonb), btrim(d->>'idempotencyKey')
  from jsonb_array_elements(p_deliveries) d
  left join reminders r on r.target_member_id = p_member_id and r.dedupe_key = nullif(d->>'reminderDedupeKey','')
  where d->>'deliveryType' in ('immediate','daily_digest','weekly_digest') and d->>'channel' = 'planned'
    and d->>'importance' in ('quiet','normal','important') and btrim(coalesce(d->>'idempotencyKey','')) <> ''
    and length(d->>'idempotencyKey') <= 300 and btrim(coalesce(d->>'title','')) <> ''
    and (d->>'reminderDedupeKey' is null or (r.resolved_at is null and r.dismissed_at is null))
  on conflict (idempotency_key) do nothing;
  get diagnostics deliveries_created = row_count;

  update notification_deliveries set status = 'pending', processing_started_at = null,
    next_attempt_at = now(), updated_at = now(), error_code = 'lease_expired'
  where id in (select id from notification_deliveries where status = 'processing' and processing_started_at < now() - interval '15 minutes' order by processing_started_at limit 100);

  delete from reminders where id in (
    select id from reminders where target_member_id = p_member_id
      and (resolved_at is not null or dismissed_at is not null)
      and coalesce(resolved_at, dismissed_at) < now() - interval '90 days'
    order by coalesce(resolved_at, dismissed_at) limit 250
  );

  return jsonb_build_object(
    'remindersCreated', created_count,
    'remindersUpdated', greatest(changed_count - created_count, 0),
    'remindersResolved', resolved_count,
    'deliveriesCreated', deliveries_created,
    'deliveriesCancelled', deliveries_cancelled
  );
end;
$$;

revoke all on function sync_server_member_reminders(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function sync_server_member_reminders(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

create or replace function configure_process_reminders_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, pg_catalog
as $$
declare
  job_id bigint;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'rodinka_project_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'rodinka_reminder_cron_secret')
  then raise exception 'Create rodinka_project_url and rodinka_reminder_cron_secret in Vault first'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'rodinka-process-reminders-10m';
  select cron.schedule(
    'rodinka-process-reminders-10m', '*/10 * * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'rodinka_project_url') || '/functions/v1/process-reminders',
      headers := jsonb_build_object('Content-Type','application/json','x-rodinka-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'rodinka_reminder_cron_secret')),
      body := '{"batchSize":50,"fairQueue":true}'::jsonb,
      timeout_milliseconds := 5000
    );$job$
  ) into job_id;
  return job_id;
end;
$$;

revoke all on function configure_process_reminders_cron() from public, anon, authenticated, service_role;

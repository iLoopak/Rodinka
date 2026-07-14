-- Phase 4 hardening: serialize concurrent syncs, limit client-controlled
-- reminder payloads, narrow state writes, and make retention queries cheap.

alter table notification_preferences
  add column timezone_mode text not null default 'auto'
  check (timezone_mode in ('auto', 'explicit'));

alter table reminders
  add constraint reminders_source_ids_array
  check (metadata ? 'sourceIds' and jsonb_typeof(metadata->'sourceIds') = 'array') not valid;
alter table reminders validate constraint reminders_source_ids_array;

create index reminders_active_event_idx
  on reminders(target_member_id, event_at)
  where resolved_at is null and dismissed_at is null;

create index reminders_retention_idx
  on reminders(target_member_id, (coalesce(resolved_at, dismissed_at)))
  where resolved_at is not null or dismissed_at is not null;

drop policy if exists "members update own reminders" on reminders;

create or replace function set_member_reminder_state(
  p_family_id uuid,
  p_reminder_ids uuid[],
  p_action text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_member_id uuid;
  changed_count integer := 0;
begin
  if p_action not in ('read', 'dismiss') then
    raise exception 'Unsupported reminder state action';
  end if;
  if coalesce(array_length(p_reminder_ids, 1), 0) > 300 then
    raise exception 'Too many reminder IDs';
  end if;

  select m.id into actor_member_id
  from members m
  where m.family_id = p_family_id and m.user_id = auth.uid()
  limit 1;
  if actor_member_id is null then raise exception 'Not authorized for this family'; end if;

  if p_action = 'read' then
    update reminders r
    set read_at = coalesce(r.read_at, now()), updated_at = now()
    where r.family_id = p_family_id
      and r.target_member_id = actor_member_id
      and r.id = any(coalesce(p_reminder_ids, '{}'::uuid[]))
      and r.read_at is null;
  else
    update reminders r
    set dismissed_at = coalesce(r.dismissed_at, now()), updated_at = now()
    where r.family_id = p_family_id
      and r.target_member_id = actor_member_id
      and r.id = any(coalesce(p_reminder_ids, '{}'::uuid[]))
      and r.dismissed_at is null
      and r.resolved_at is null;
  end if;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function set_member_reminder_state(uuid, uuid[], text) from public;
grant execute on function set_member_reminder_state(uuid, uuid[], text) to authenticated;

create or replace function sync_member_reminders(p_family_id uuid, p_reminders jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_member_id uuid;
  synced_count integer := 0;
begin
  if jsonb_typeof(p_reminders) <> 'array' then
    raise exception 'Reminders must be an array';
  end if;
  if jsonb_array_length(p_reminders) > 250 then
    raise exception 'Too many reminders in one sync';
  end if;

  select m.id into actor_member_id
  from members m
  where m.family_id = p_family_id and m.user_id = auth.uid()
  limit 1;
  if actor_member_id is null then raise exception 'Not authorized for this family'; end if;

  -- One deterministic sync per member at a time. The unique constraint remains
  -- the final duplicate-write guard; the lock also prevents interleaved resolve.
  perform pg_advisory_xact_lock(hashtextextended(actor_member_id::text, 0));

  insert into reminders (
    family_id, target_member_id, dedupe_key, source, reminder_type, title,
    description, importance, event_at, generated_at, expires_at, deep_link,
    grouping_key, metadata, last_seen_at, updated_at
  )
  select
    p_family_id,
    actor_member_id,
    btrim(item->>'dedupeKey'),
    item->>'source',
    item->>'type',
    btrim(item->>'title'),
    nullif(item->>'description', ''),
    item->>'importance',
    nullif(item->>'eventAt', '')::timestamptz,
    (item->>'generatedAt')::timestamptz,
    nullif(item->>'expiresAt', '')::timestamptz,
    nullif(item->>'deepLink', ''),
    nullif(item->>'groupingKey', ''),
    item->'metadata',
    now(),
    now()
  from jsonb_array_elements(p_reminders) item
  where btrim(coalesce(item->>'dedupeKey', '')) <> ''
    and length(item->>'dedupeKey') <= 240
    and btrim(coalesce(item->>'type', '')) <> ''
    and length(item->>'type') <= 100
    and btrim(coalesce(item->>'title', '')) <> ''
    and length(item->>'title') <= 180
    and length(coalesce(item->>'description', '')) <= 800
    and length(coalesce(item->>'deepLink', '')) <= 500
    and item->>'source' in ('chore','activity','activity-payment','medical-appointment','vaccination','voting','meal-plan','allowance','document','shopping')
    and item->>'importance' in ('quiet','normal','important')
    and jsonb_typeof(item->'metadata') = 'object'
    and case when jsonb_typeof(item->'metadata'->'sourceIds') = 'array'
      then jsonb_array_length(item->'metadata'->'sourceIds') <= 250
      else false
    end
    and pg_column_size(item->'metadata') <= 16384
    and case item->>'source'
      when 'chore' then item->>'dedupeKey' like 'chore-%'
      when 'activity' then item->>'dedupeKey' like 'activity-soon:%'
      when 'activity-payment' then item->>'dedupeKey' like 'activity-payment:%'
      when 'medical-appointment' then item->>'dedupeKey' like 'medical-tomorrow:%'
      when 'vaccination' then item->>'dedupeKey' like 'vaccination-due:%'
      when 'voting' then item->>'dedupeKey' like 'voting-closes:%'
      when 'meal-plan' then item->>'dedupeKey' like 'meal-plan:%'
      when 'allowance' then item->>'dedupeKey' like 'allowance-pending:%'
      when 'document' then item->>'dedupeKey' like 'document-expiry:%'
      when 'shopping' then item->>'dedupeKey' like 'shopping-assigned:%'
      else false
    end
    and case item->>'source'
      when 'chore' then coalesce(item->>'deepLink', '') like '/chores%'
      when 'activity' then coalesce(item->>'deepLink', '') like '/activities%'
      when 'activity-payment' then coalesce(item->>'deepLink', '') like '/activities%'
      when 'medical-appointment' then coalesce(item->>'deepLink', '') like '/health%'
      when 'vaccination' then coalesce(item->>'deepLink', '') like '/health%'
      when 'voting' then coalesce(item->>'deepLink', '') like '/meals%'
      when 'meal-plan' then coalesce(item->>'deepLink', '') like '/meals%'
      when 'allowance' then coalesce(item->>'deepLink', '') like '/chores%'
      when 'document' then nullif(item->>'deepLink', '') is null
      when 'shopping' then coalesce(item->>'deepLink', '') like '/shopping%'
      else false
    end
  on conflict (target_member_id, dedupe_key) do update set
    source = excluded.source,
    reminder_type = excluded.reminder_type,
    title = excluded.title,
    description = excluded.description,
    importance = excluded.importance,
    event_at = excluded.event_at,
    generated_at = case when reminders.resolved_at is not null then excluded.generated_at else reminders.generated_at end,
    expires_at = excluded.expires_at,
    deep_link = excluded.deep_link,
    grouping_key = excluded.grouping_key,
    metadata = excluded.metadata,
    read_at = case when reminders.resolved_at is not null then null else reminders.read_at end,
    dismissed_at = case when reminders.resolved_at is not null then null else reminders.dismissed_at end,
    resolved_at = null,
    last_seen_at = now(),
    updated_at = now()
  where reminders.resolved_at is not null
    or reminders.source is distinct from excluded.source
    or reminders.reminder_type is distinct from excluded.reminder_type
    or reminders.title is distinct from excluded.title
    or reminders.description is distinct from excluded.description
    or reminders.importance is distinct from excluded.importance
    or reminders.event_at is distinct from excluded.event_at
    or reminders.expires_at is distinct from excluded.expires_at
    or reminders.deep_link is distinct from excluded.deep_link
    or reminders.grouping_key is distinct from excluded.grouping_key
    or reminders.metadata is distinct from excluded.metadata;

  get diagnostics synced_count = row_count;

  update reminders r set resolved_at = now(), updated_at = now()
  where r.target_member_id = actor_member_id
    and r.family_id = p_family_id
    and r.resolved_at is null
    and not exists (
      select 1 from jsonb_array_elements(p_reminders) item
      where item->>'dedupeKey' = r.dedupe_key
    );

  -- Real retention: only completed history is removed. Active reminders are
  -- never eligible, regardless of age.
  delete from reminders
  where target_member_id = actor_member_id
    and (resolved_at is not null or dismissed_at is not null)
    and coalesce(resolved_at, dismissed_at) < now() - interval '90 days';

  return synced_count;
end;
$$;

revoke all on function sync_member_reminders(uuid, jsonb) from public;
grant execute on function sync_member_reminders(uuid, jsonb) to authenticated;

-- Phase 4: persisted reminder lifecycle, per-member preferences, and
-- the smallest source extension needed to resolve activity payment reminders.

alter table activities add column payment_paid_at timestamptz;
alter table activities add column payment_paid_for_date date;

create table notification_preferences (
  member_id uuid primary key references members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  daily_digest_enabled boolean not null default false,
  weekly_digest_enabled boolean not null default false,
  quiet_push_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '21:00',
  quiet_hours_end time not null default '07:00',
  timezone text not null default 'UTC',
  category_preferences jsonb not null default '{"chores":true,"activities":true,"medical":true,"voting":true,"meals":true,"allowance":true,"documents":true,"shopping":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_timezone_not_blank check (btrim(timezone) <> ''),
  constraint notification_preferences_categories_object check (jsonb_typeof(category_preferences) = 'object')
);

create index notification_preferences_family_idx on notification_preferences(family_id);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  target_member_id uuid not null references members(id) on delete cascade,
  dedupe_key text not null,
  source text not null check (source in ('chore','activity','activity-payment','medical-appointment','vaccination','voting','meal-plan','allowance','document','shopping')),
  reminder_type text not null,
  title text not null,
  description text,
  importance text not null check (importance in ('quiet','normal','important')),
  event_at timestamptz,
  generated_at timestamptz not null,
  expires_at timestamptz,
  deep_link text,
  grouping_key text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_member_id, dedupe_key),
  constraint reminders_dedupe_key_not_blank check (btrim(dedupe_key) <> ''),
  constraint reminders_title_not_blank check (btrim(title) <> ''),
  constraint reminders_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index reminders_active_member_idx
  on reminders(target_member_id, resolved_at, dismissed_at, generated_at desc);
create index reminders_history_member_idx
  on reminders(target_member_id, updated_at desc)
  where resolved_at is not null or dismissed_at is not null;

create or replace function validate_notification_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from members m
    where m.id = new.member_id and m.family_id = new.family_id
  ) then
    raise exception 'Notification preference member must belong to the family';
  end if;
  return new;
end;
$$;

create trigger validate_notification_preferences_owner
before insert or update on notification_preferences
for each row execute function validate_notification_owner();

alter table notification_preferences enable row level security;
alter table reminders enable row level security;

create policy "members read own notification preferences" on notification_preferences for select
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.family_id = family_id));
create policy "members create own notification preferences" on notification_preferences for insert
  with check (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.family_id = family_id));
create policy "members update own notification preferences" on notification_preferences for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.family_id = family_id))
  with check (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.family_id = family_id));

create policy "members read own reminders" on reminders for select
  using (exists (select 1 from members m where m.id = target_member_id and m.user_id = auth.uid() and m.family_id = family_id));
create policy "members update own reminders" on reminders for update
  using (exists (select 1 from members m where m.id = target_member_id and m.user_id = auth.uid() and m.family_id = family_id))
  with check (exists (select 1 from members m where m.id = target_member_id and m.user_id = auth.uid() and m.family_id = family_id));

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
    coalesce(item->'metadata', '{}'::jsonb),
    now(),
    now()
  from jsonb_array_elements(p_reminders) item
  where btrim(coalesce(item->>'dedupeKey', '')) <> ''
    and btrim(coalesce(item->>'title', '')) <> ''
    and item->>'source' in ('chore','activity','activity-payment','medical-appointment','vaccination','voting','meal-plan','allowance','document','shopping')
    and item->>'importance' in ('quiet','normal','important')
  on conflict (target_member_id, dedupe_key) do update set
    source = excluded.source,
    reminder_type = excluded.reminder_type,
    title = excluded.title,
    description = excluded.description,
    importance = excluded.importance,
    event_at = excluded.event_at,
    generated_at = excluded.generated_at,
    expires_at = excluded.expires_at,
    deep_link = excluded.deep_link,
    grouping_key = excluded.grouping_key,
    metadata = excluded.metadata,
    read_at = case when reminders.resolved_at is not null then null else reminders.read_at end,
    dismissed_at = case when reminders.resolved_at is not null then null else reminders.dismissed_at end,
    resolved_at = null,
    last_seen_at = now(),
    updated_at = now();

  get diagnostics synced_count = row_count;

  update reminders r set resolved_at = now(), updated_at = now()
  where r.target_member_id = actor_member_id
    and r.family_id = p_family_id
    and r.resolved_at is null
    and not exists (
      select 1 from jsonb_array_elements(p_reminders) item
      where item->>'dedupeKey' = r.dedupe_key
    );

  delete from reminders
  where target_member_id = actor_member_id
    and coalesce(resolved_at, dismissed_at) < now() - interval '90 days';

  return synced_count;
end;
$$;

revoke all on function sync_member_reminders(uuid, jsonb) from public;
grant execute on function sync_member_reminders(uuid, jsonb) to authenticated;

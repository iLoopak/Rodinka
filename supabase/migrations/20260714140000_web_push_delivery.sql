-- Phase 4.1 PR2: standards-based PWA Web Push, device subscriptions and sender leases.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  target_member_id uuid not null references members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  content_encoding text not null default 'aes128gcm' check (content_encoding = 'aes128gcm'),
  device_name text,
  platform text,
  browser text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (endpoint ~ '^https://'),
  check (length(endpoint) between 20 and 2048),
  check (length(p256dh) between 40 and 300),
  check (length(auth) between 8 and 100),
  check (device_name is null or length(device_name) <= 80),
  check (platform is null or length(platform) <= 40),
  check (browser is null or length(browser) <= 40)
);

create index push_subscriptions_user_idx on push_subscriptions(user_id, last_seen_at desc);
create index push_subscriptions_active_member_idx on push_subscriptions(target_member_id)
  where disabled_at is null and revoked_at is null;

alter table push_subscriptions enable row level security;
create policy "users read own push devices" on push_subscriptions for select
  using (user_id = auth.uid());

-- Writes go through narrow RPCs so identity and family membership are derived,
-- and normal clients never get arbitrary update access to delivery diagnostics.
revoke all on table push_subscriptions from anon, authenticated;
grant select on table push_subscriptions to authenticated;
grant all on table push_subscriptions to service_role;

create or replace function register_push_subscription(
  p_family_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_content_encoding text default 'aes128gcm',
  p_device_name text default null,
  p_platform text default null,
  p_browser text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_member_id uuid;
  subscription_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select m.id into actor_member_id from members m
  where m.family_id = p_family_id and m.user_id = actor limit 1;
  if actor_member_id is null then raise exception 'Not authorized for this family'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) not between 20 and 2048 then raise exception 'Invalid push endpoint'; end if;
  if p_content_encoding <> 'aes128gcm' then raise exception 'Unsupported push content encoding'; end if;

  insert into push_subscriptions (
    user_id, family_id, target_member_id, endpoint, p256dh, auth, content_encoding,
    device_name, platform, browser
  ) values (
    actor, p_family_id, actor_member_id, p_endpoint, p_p256dh, p_auth, p_content_encoding,
    nullif(left(btrim(p_device_name), 80), ''), nullif(left(btrim(p_platform), 40), ''),
    nullif(left(btrim(p_browser), 40), '')
  )
  on conflict (endpoint) do update set
    user_id = actor,
    family_id = p_family_id,
    target_member_id = actor_member_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    content_encoding = excluded.content_encoding,
    device_name = excluded.device_name,
    platform = excluded.platform,
    browser = excluded.browser,
    updated_at = now(),
    last_seen_at = now(),
    disabled_at = null,
    revoked_at = null,
    failure_count = 0
  returning id into subscription_id;
  return subscription_id;
end;
$$;

revoke all on function register_push_subscription(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function register_push_subscription(uuid,text,text,text,text,text,text,text) to authenticated;

create or replace function revoke_push_subscription(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update push_subscriptions set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where id = p_subscription_id and user_id = auth.uid() and revoked_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function revoke_push_subscription(uuid) from public, anon;
grant execute on function revoke_push_subscription(uuid) to authenticated;

alter table notification_deliveries
  add column processing_token uuid,
  add column lease_expires_at timestamptz,
  add column expires_at timestamptz not null default (now() + interval '24 hours'),
  add column max_attempts integer not null default 5 check (max_attempts between 1 and 10);

-- Existing PR1 rows keep the same 24-hour lifetime relative to their creation,
-- rather than receiving a fresh 24 hours at migration time.
update notification_deliveries set expires_at = created_at + interval '24 hours';

create table notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references notification_deliveries(id) on delete cascade,
  push_subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'processing' check (status in ('processing','succeeded','failed','dead','skipped')),
  response_status integer,
  error_code text,
  retryable boolean not null default false,
  created_at timestamptz not null default now(),
  unique(delivery_id, push_subscription_id, attempt_number),
  check (error_code is null or length(error_code) <= 100)
);

create index notification_delivery_attempts_delivery_idx
  on notification_delivery_attempts(delivery_id, started_at desc);
alter table notification_delivery_attempts enable row level security;
revoke all on table notification_delivery_attempts from public, anon, authenticated;
grant all on table notification_delivery_attempts to service_role;

create or replace function claim_notification_deliveries(p_batch_size integer, p_processing_token uuid, p_only_id uuid default null)
returns setof notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_processing_token is null then raise exception 'Processing token required'; end if;

  update notification_deliveries d set
    status = 'pending', processing_started_at = null, processing_token = null,
    lease_expires_at = null, updated_at = now()
  where d.status = 'processing' and d.lease_expires_at < now();

  update notification_deliveries d set
    status = 'cancelled', error_code = case
      when d.expires_at <= now() then 'delivery_expired'
      when d.attempt_count >= d.max_attempts then 'max_attempts_reached'
      else 'reminder_no_longer_relevant' end,
    failed_at = now(), updated_at = now()
  where d.status in ('pending','failed') and (
    d.expires_at <= now() or d.attempt_count >= d.max_attempts or
    (d.delivery_type = 'immediate' and d.reminder_dedupe_key is not null and d.reminder_id is null) or
    (d.reminder_id is not null and exists (
      select 1 from reminders r where r.id = d.reminder_id
        and (r.resolved_at is not null or r.dismissed_at is not null or (r.expires_at is not null and r.expires_at <= now()))
    ))
  );

  return query
  with due as (
    select d.id from notification_deliveries d
    where d.status in ('pending','failed')
      and d.scheduled_for <= now()
      and (d.next_attempt_at is null or d.next_attempt_at <= now())
      and d.expires_at > now() and d.attempt_count < d.max_attempts
      and (p_only_id is null or d.id = p_only_id)
    order by d.scheduled_for, d.created_at
    for update skip locked
    limit least(greatest(p_batch_size, 1), 100)
  )
  update notification_deliveries d set
    status = 'processing', channel = 'push', processing_started_at = now(),
    processing_token = p_processing_token, lease_expires_at = now() + interval '3 minutes',
    attempt_count = d.attempt_count + 1, updated_at = now()
  from due where d.id = due.id
  returning d.*;
end;
$$;

revoke all on function claim_notification_deliveries(integer,uuid,uuid) from public, anon, authenticated;
grant execute on function claim_notification_deliveries(integer,uuid,uuid) to service_role;

create or replace function finish_notification_delivery(
  p_delivery_id uuid,
  p_processing_token uuid,
  p_status text,
  p_error_code text default null,
  p_next_attempt_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_status not in ('pending','delivered','failed','cancelled') then raise exception 'Invalid final status'; end if;
  update notification_deliveries set
    status = p_status,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    failed_at = case when p_status in ('failed','cancelled') then now() else null end,
    error_code = p_error_code,
    next_attempt_at = p_next_attempt_at,
    processing_started_at = null, processing_token = null, lease_expires_at = null,
    updated_at = now()
  where id = p_delivery_id and status = 'processing' and processing_token = p_processing_token;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function finish_notification_delivery(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function finish_notification_delivery(uuid,uuid,text,text,timestamptz) to service_role;

create or replace function queue_test_notification(p_family_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid(); actor_member_id uuid; delivery_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select m.id into actor_member_id from members m
  where m.family_id = p_family_id and m.user_id = actor limit 1;
  if actor_member_id is null then raise exception 'Not authorized for this family'; end if;
  if not exists (select 1 from notification_preferences p where p.member_id = actor_member_id and p.push_enabled) then
    raise exception 'Push is disabled for this account';
  end if;
  if not exists (select 1 from push_subscriptions s where s.user_id = actor and s.family_id = p_family_id and s.disabled_at is null and s.revoked_at is null) then
    raise exception 'No active push device';
  end if;
  if exists (select 1 from notification_deliveries d where d.user_id = actor and d.metadata->>'test' = 'true' and d.created_at > now() - interval '2 minutes') then
    raise exception 'Please wait before sending another test';
  end if;

  insert into notification_deliveries (
    user_id, family_id, target_member_id, delivery_type, channel, title, body, deep_link,
    importance, scheduled_for, idempotency_key, metadata
  ) values (
    actor, p_family_id, actor_member_id, 'immediate', 'push', 'Test oznámení Rodinka',
    'Push oznámení jsou na tomto zařízení nastavená správně.', '/reminders#settings',
    'normal', now(), 'push-test:' || actor::text || ':' || floor(extract(epoch from now()) / 120)::bigint,
    jsonb_build_object('test', true)
  ) returning id into delivery_id;
  return delivery_id;
end;
$$;

revoke all on function queue_test_notification(uuid) from public, anon;
grant execute on function queue_test_notification(uuid) to authenticated;

create or replace function configure_notification_sender_cron()
returns void
language plpgsql
security definer
set search_path = public, cron, vault, net
as $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'rodinka_project_url') then raise exception 'Missing Vault secret: rodinka_project_url'; end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'rodinka_notification_sender_secret') then raise exception 'Missing Vault secret: rodinka_notification_sender_secret'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'rodinka-send-notifications-2m';
  perform cron.schedule(
    'rodinka-send-notifications-2m', '*/2 * * * *',
    format($job$select net.http_post(
      url := %L || '/functions/v1/send-notification-deliveries',
      headers := jsonb_build_object('Content-Type','application/json','x-notification-sender-secret',%L),
      body := '{"mode":"scheduled","batchSize":50}'::jsonb,
      timeout_milliseconds := 120000
    );$job$,
      (select decrypted_secret from vault.decrypted_secrets where name = 'rodinka_project_url'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'rodinka_notification_sender_secret')
    )
  );
end;
$$;

revoke all on function configure_notification_sender_cron() from public, anon, authenticated, service_role;

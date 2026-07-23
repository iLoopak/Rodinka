-- Capacitor native wrap: device-token registration for iOS/Android push,
-- kept as a sibling table rather than widening `push_subscriptions` — an
-- APNs/FCM device token is an opaque string, not a Web Push endpoint URL, so
-- reusing that table would mean relaxing its `endpoint ~ '^https://'` and
-- `p256dh`/`auth` key-length checks, weakening validation on the existing,
-- already-shipped Web Push path for no benefit.
--
-- This migration only adds registration/revocation plumbing. It does NOT
-- wire actual APNs/FCM delivery into `send-notification-deliveries` — that
-- requires the app owner's own Firebase project and Apple Push key/cert,
-- which this environment has no access to. See docs/CAPACITOR_NATIVE_SETUP.md.

create table native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  target_member_id uuid not null references members(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  device_token text not null unique,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  revoked_at timestamptz,
  check (length(device_token) between 16 and 4096),
  check (device_name is null or length(device_name) <= 80)
);

create index native_push_tokens_user_idx on native_push_tokens(user_id, last_seen_at desc);
create index native_push_tokens_active_member_idx on native_push_tokens(target_member_id)
  where disabled_at is null and revoked_at is null;

alter table native_push_tokens enable row level security;
create policy "users read own native push tokens" on native_push_tokens for select
  using (user_id = auth.uid());

-- Same shape as push_subscriptions: writes only through narrow RPCs.
revoke all on table native_push_tokens from anon, authenticated;
grant select on table native_push_tokens to authenticated;
grant all on table native_push_tokens to service_role;

create or replace function register_native_push_token(
  p_family_id uuid,
  p_platform text,
  p_device_token text,
  p_device_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_member_id uuid;
  token_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select m.id into actor_member_id from members m
  where m.family_id = p_family_id and m.user_id = actor limit 1;
  if actor_member_id is null then raise exception 'Not authorized for this family'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'Unsupported native push platform'; end if;
  if length(p_device_token) not between 16 and 4096 then raise exception 'Invalid device token'; end if;

  insert into native_push_tokens (
    user_id, family_id, target_member_id, platform, device_token, device_name
  ) values (
    actor, p_family_id, actor_member_id, p_platform, p_device_token,
    nullif(left(btrim(p_device_name), 80), '')
  )
  on conflict (device_token) do update set
    user_id = actor,
    family_id = p_family_id,
    target_member_id = actor_member_id,
    platform = excluded.platform,
    device_name = excluded.device_name,
    updated_at = now(),
    last_seen_at = now(),
    disabled_at = null,
    revoked_at = null,
    failure_count = 0
  returning id into token_id;
  return token_id;
end;
$$;

revoke all on function register_native_push_token(uuid, text, text, text) from public, anon;
grant execute on function register_native_push_token(uuid, text, text, text) to authenticated;

create or replace function revoke_native_push_token(p_token_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update native_push_tokens set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where id = p_token_id and user_id = auth.uid() and revoked_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function revoke_native_push_token(uuid) from public, anon;
grant execute on function revoke_native_push_token(uuid) to authenticated;

create or replace function revoke_native_push_token_by_device(p_device_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update native_push_tokens set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where device_token = p_device_token and user_id = auth.uid() and revoked_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function revoke_native_push_token_by_device(text) from public, anon;
grant execute on function revoke_native_push_token_by_device(text) to authenticated;

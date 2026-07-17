-- Child Accounts Batch 1: canonical authorization, managed account lifecycle,
-- and child/adult permission boundaries. Existing member rows remain the
-- canonical household identity; credentials live only in Supabase Auth.

-- ============================================================
-- Managed child-account lifecycle metadata
-- ============================================================

create table if not exists public.child_accounts (
  member_id uuid primary key references public.members(id) on delete cascade,
  login_name text not null unique,
  internal_identifier text not null unique,
  auth_user_id uuid unique,
  status text not null check (status in ('provisioning', 'active', 'revoked')),
  managed_by_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  provisioning_started_at timestamptz,
  activated_at timestamptz,
  password_reset_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint child_accounts_login_name_format check (
    login_name ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$'
  ),
  constraint child_accounts_internal_identifier check (
    internal_identifier = 'child.' || login_name || '@children.rodinka.invalid'
  )
);

create unique index if not exists members_one_auth_identity_idx
  on public.members(user_id) where user_id is not null;

alter table public.child_accounts enable row level security;
revoke all on table public.child_accounts from public, anon;
grant select on table public.child_accounts to authenticated;
grant all on table public.child_accounts to service_role;

-- Make policy replacement safe if this migration is reapplied in a local or
-- recovery environment. The legacy names are dropped again near each table.
do $migration$
declare target record;
begin
  for target in select * from (values
    ('child_accounts', 'adults read child accounts'),
    ('families', 'active members read own family'),
    ('families', 'active admins update own family'),
    ('members', 'members read permitted household members'),
    ('members', 'active adults add managed children'),
    ('invites', 'active adults read invites'),
    ('invites', 'active adults create invites'),
    ('chores', 'read permitted chores'),
    ('chore_completions', 'read permitted chore completions'),
    ('chore_completions', 'create permitted chore completions'),
    ('allowance_ledger', 'read permitted allowance ledger'),
    ('allowance_plans', 'read permitted allowance plans'),
    ('allowance_plan_requirements', 'read permitted allowance requirements'),
    ('allowance_cycles', 'read permitted allowance cycles'),
    ('occurrence_overrides', 'read permitted occurrence overrides'),
    ('series_assignment_history', 'read permitted assignment history'),
    ('activities', 'read permitted activities'),
    ('activity_participants', 'read permitted activity participants'),
    ('activity_participant_history', 'read permitted activity participant history'),
    ('medical_records', 'read permitted medical records'),
    ('meals', 'active members read meals'),
    ('meal_vote_rounds', 'active members read vote rounds'),
    ('meal_vote_candidates', 'active members read vote candidates'),
    ('meal_votes', 'active members read meal votes'),
    ('meal_votes', 'cast permitted meal votes'),
    ('meal_votes', 'change permitted meal votes'),
    ('meal_plan_entries', 'active members read meal plan'),
    ('shopping_items', 'active members read shopping items'),
    ('shopping_items', 'create permitted shopping items'),
    ('shopping_items', 'active adults update shopping items'),
    ('shopping_items', 'active adults delete shopping items'),
    ('notification_preferences', 'active members read own notification preferences'),
    ('notification_preferences', 'active members create own notification preferences'),
    ('notification_preferences', 'active members update own notification preferences'),
    ('reminders', 'active members read own reminders'),
    ('push_subscriptions', 'active members read own push devices')
  ) as policies(table_name, policy_name)
  loop
    execute format('drop policy if exists %I on public.%I', target.policy_name, target.table_name);
  end loop;
end
$migration$;

-- ============================================================
-- Canonical active-member authorization helpers
-- ============================================================

create or replace function public.current_active_member_id()
returns uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select m.id from public.members m
  where m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
  order by m.created_at limit 1;
$$;

create or replace function public.current_active_family_id()
returns uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select m.family_id from public.members m
  where m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
  order by m.created_at limit 1;
$$;

create or replace function public.is_active_family_member(p_family_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.members m
    where m.family_id = p_family_id and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  );
$$;

create or replace function public.is_active_family_adult(p_family_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.members m
    where m.family_id = p_family_id and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and m.role in ('admin', 'parent')
  );
$$;

create or replace function public.is_current_child(p_member_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member_id and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active' and m.role = 'child'
  );
$$;

create or replace function public.can_current_actor_act_for_member(p_member_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.members target
    join public.members actor on actor.family_id = target.family_id
    where target.id = p_member_id
      and actor.user_id = auth.uid()
      and coalesce(actor.status, 'active') = 'active'
      and coalesce(target.status, 'active') = 'active'
      and (actor.role in ('admin', 'parent') or actor.id = target.id)
  );
$$;

-- Preserve legacy call sites while making their meaning canonical and active-only.
create or replace function public.is_family_member(fid uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.is_active_family_member(fid);
$$;

create or replace function public.is_family_parent(fid uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.is_active_family_adult(fid);
$$;

revoke all on function public.current_active_member_id() from public, anon;
revoke all on function public.current_active_family_id() from public, anon;
revoke all on function public.is_active_family_member(uuid) from public, anon;
revoke all on function public.is_active_family_adult(uuid) from public, anon;
revoke all on function public.is_current_child(uuid) from public, anon;
revoke all on function public.can_current_actor_act_for_member(uuid) from public, anon;
revoke all on function public.is_family_member(uuid) from public, anon;
revoke all on function public.is_family_parent(uuid) from public, anon;
grant execute on function public.current_active_member_id() to authenticated;
grant execute on function public.current_active_family_id() to authenticated;
grant execute on function public.is_active_family_member(uuid) to authenticated;
grant execute on function public.is_active_family_adult(uuid) to authenticated;
grant execute on function public.is_current_child(uuid) to authenticated;
grant execute on function public.can_current_actor_act_for_member(uuid) to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_parent(uuid) to authenticated;

drop policy if exists "adults read child accounts" on public.child_accounts;
create policy "adults read child accounts" on public.child_accounts for select to authenticated
using (
  exists (
    select 1 from public.members child
    where child.id = child_accounts.member_id
      and public.is_active_family_adult(child.family_id)
  )
);

-- ============================================================
-- Account lifecycle primitives: service-role only and row-locked
-- ============================================================

create or replace function public.begin_child_account_provision(
  p_member_id uuid,
  p_manager_member_id uuid,
  p_login_name text,
  p_internal_identifier text
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare target public.members%rowtype; manager public.members%rowtype; account public.child_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into target from public.members where id = p_member_id for update;
  select * into manager from public.members where id = p_manager_member_id;
  if target.id is null or target.role <> 'child' or coalesce(target.status, 'active') <> 'active' then
    raise exception 'Active child member required';
  end if;
  if manager.id is null or manager.family_id <> target.family_id
    or manager.role not in ('admin', 'parent') or coalesce(manager.status, 'active') <> 'active' then
    raise exception 'Active adult manager required';
  end if;
  if target.user_id is not null then raise exception 'Child already has linked access'; end if;
  if p_login_name !~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$'
    or p_internal_identifier <> 'child.' || p_login_name || '@children.rodinka.invalid' then
    raise exception 'Invalid managed login identity';
  end if;
  select * into account from public.child_accounts where member_id = target.id for update;
  if account.status in ('provisioning', 'active') then raise exception 'Child account already exists'; end if;

  insert into public.child_accounts (
    member_id, login_name, internal_identifier, status, managed_by_member_id,
    provisioning_started_at, revoked_at, updated_at
  ) values (
    target.id, p_login_name, p_internal_identifier, 'provisioning', manager.id,
    now(), null, now()
  ) on conflict (member_id) do update set
    login_name = excluded.login_name,
    internal_identifier = excluded.internal_identifier,
    auth_user_id = null,
    status = 'provisioning',
    managed_by_member_id = excluded.managed_by_member_id,
    provisioning_started_at = now(),
    activated_at = null,
    revoked_at = null,
    updated_at = now();
end;
$$;

create or replace function public.finalize_child_account_provision(
  p_member_id uuid,
  p_manager_member_id uuid,
  p_auth_user_id uuid
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare target public.members%rowtype; manager public.members%rowtype; account public.child_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into target from public.members where id = p_member_id for update;
  select * into manager from public.members where id = p_manager_member_id;
  select * into account from public.child_accounts where member_id = p_member_id for update;
  if target.id is null or target.role <> 'child' or coalesce(target.status, 'active') <> 'active'
    or target.user_id is not null then raise exception 'Child cannot be linked'; end if;
  if manager.id is null or manager.family_id <> target.family_id
    or manager.role not in ('admin', 'parent') or coalesce(manager.status, 'active') <> 'active' then
    raise exception 'Active adult manager required';
  end if;
  if account.member_id is null or account.status <> 'provisioning'
    or account.managed_by_member_id <> manager.id then raise exception 'Provisioning reservation not found'; end if;
  if p_auth_user_id is null then raise exception 'Auth user required'; end if;
  update public.members set user_id = p_auth_user_id, updated_at = now() where id = target.id;
  update public.child_accounts set auth_user_id = p_auth_user_id, status = 'active',
    activated_at = now(), revoked_at = null, updated_at = now() where member_id = target.id;
end;
$$;

create or replace function public.abort_child_account_provision(
  p_member_id uuid,
  p_manager_member_id uuid
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.child_accounts ca set status = 'revoked', auth_user_id = null,
    managed_by_member_id = p_manager_member_id, revoked_at = now(), updated_at = now()
  from public.members child, public.members manager
  where ca.member_id = p_member_id and child.id = ca.member_id
    and manager.id = p_manager_member_id and manager.family_id = child.family_id
    and manager.role in ('admin', 'parent') and coalesce(manager.status, 'active') = 'active'
    and ca.status = 'provisioning';
end;
$$;

create or replace function public.record_child_account_password_reset(
  p_member_id uuid,
  p_manager_member_id uuid
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.child_accounts ca set password_reset_at = now(),
    managed_by_member_id = p_manager_member_id, updated_at = now()
  from public.members child, public.members manager
  where ca.member_id = p_member_id and child.id = ca.member_id
    and manager.id = p_manager_member_id and manager.family_id = child.family_id
    and manager.role in ('admin', 'parent') and coalesce(manager.status, 'active') = 'active'
    and ca.status = 'active' and ca.auth_user_id = child.user_id;
  if not found then raise exception 'Active child account not found'; end if;
end;
$$;

create or replace function public.detach_child_account_access(
  p_member_id uuid,
  p_manager_member_id uuid
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare target public.members%rowtype; manager public.members%rowtype; account public.child_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into target from public.members where id = p_member_id for update;
  select * into manager from public.members where id = p_manager_member_id;
  select * into account from public.child_accounts where member_id = p_member_id for update;
  if target.id is null or target.role <> 'child' then raise exception 'Child member not found'; end if;
  if manager.id is null or manager.family_id <> target.family_id
    or manager.role not in ('admin', 'parent') or coalesce(manager.status, 'active') <> 'active' then
    raise exception 'Active adult manager required';
  end if;
  update public.members set removed_user_id = coalesce(user_id, removed_user_id), user_id = null, updated_at = now()
    where id = target.id;
  update public.child_accounts set status = 'revoked', managed_by_member_id = manager.id,
    revoked_at = coalesce(revoked_at, now()), updated_at = now() where member_id = target.id;
  update public.push_subscriptions set revoked_at = coalesce(revoked_at, now()), disabled_at = coalesce(disabled_at, now())
    where target_member_id = target.id and revoked_at is null;
  return jsonb_build_object('status', 'revoked', 'auth_user_id', account.auth_user_id);
end;
$$;

create or replace function public.mark_detached_child_account_revoked()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if old.user_id is not null and (new.user_id is null or coalesce(new.status, 'active') <> 'active') then
    update public.child_accounts set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
    where member_id = new.id and status <> 'revoked';
  end if;
  return new;
end;
$$;

drop trigger if exists members_detach_child_account on public.members;
create trigger members_detach_child_account after update of user_id, status on public.members
for each row execute function public.mark_detached_child_account_revoked();

revoke all on function public.begin_child_account_provision(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.finalize_child_account_provision(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.abort_child_account_provision(uuid,uuid) from public, anon, authenticated;
revoke all on function public.record_child_account_password_reset(uuid,uuid) from public, anon, authenticated;
revoke all on function public.detach_child_account_access(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mark_detached_child_account_revoked() from public, anon, authenticated;
grant execute on function public.begin_child_account_provision(uuid,uuid,text,text) to service_role;
grant execute on function public.finalize_child_account_provision(uuid,uuid,uuid) to service_role;
grant execute on function public.abort_child_account_provision(uuid,uuid) to service_role;
grant execute on function public.record_child_account_password_reset(uuid,uuid) to service_role;
grant execute on function public.detach_child_account_access(uuid,uuid) to service_role;

-- ============================================================
-- Family/member/invitation boundary
-- ============================================================

drop policy if exists "select own family" on public.families;
create policy "active members read own family" on public.families for select to authenticated
using (public.is_active_family_member(id));
drop policy if exists "update own family if admin" on public.families;
create policy "active admins update own family" on public.families for update to authenticated
using (exists (select 1 from public.members m where m.family_id = families.id and m.user_id = auth.uid() and m.role = 'admin' and coalesce(m.status, 'active') = 'active'))
with check (exists (select 1 from public.members m where m.family_id = families.id and m.user_id = auth.uid() and m.role = 'admin' and coalesce(m.status, 'active') = 'active'));

drop policy if exists "select members of own family" on public.members;
create policy "members read permitted household members" on public.members for select to authenticated
using (
  public.is_active_family_adult(family_id)
  or (coalesce(status, 'active') = 'active' and public.is_active_family_member(family_id))
);
drop policy if exists "parents can add children to own family" on public.members;
create policy "active adults add managed children" on public.members for insert to authenticated
with check (public.is_active_family_adult(family_id) and role = 'child' and user_id is null and coalesce(status, 'active') = 'active');

drop policy if exists "select invites for own family" on public.invites;
drop policy if exists "create invites for own family" on public.invites;
create policy "active adults read invites" on public.invites for select to authenticated
using (public.is_active_family_adult(family_id));
create policy "active adults create invites" on public.invites for insert to authenticated
with check (public.is_active_family_adult(family_id) and created_by = auth.uid());

create or replace function public.create_invite(fid uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare new_code text;
begin
  if not public.is_active_family_adult(fid) then raise exception 'Active adult membership required'; end if;
  loop
    new_code := upper(substring(md5(gen_random_uuid()::text) from 1 for 6));
    begin
      insert into public.invites(family_id, code, created_by) values(fid, new_code, auth.uid());
      return new_code;
    exception when unique_violation then null;
    end;
  end loop;
end;
$$;

create or replace function public.create_family(family_name text, admin_display_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_family_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if auth.jwt()->'app_metadata'->>'account_type' = 'managed_child' then raise exception 'Managed child accounts cannot create households'; end if;
  if btrim(coalesce(family_name, '')) = '' or btrim(coalesce(admin_display_name, '')) = '' then raise exception 'Family and member names are required'; end if;
  insert into public.families(name) values(btrim(family_name)) returning id into new_family_id;
  insert into public.members(family_id,user_id,display_name,role) values(new_family_id,auth.uid(),btrim(admin_display_name),'admin');
  return new_family_id;
end;
$$;

create or replace function public.redeem_invite(invite_code text, display_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare target_invite public.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if auth.jwt()->'app_metadata'->>'account_type' = 'managed_child' then raise exception 'Managed child accounts cannot redeem adult invitations'; end if;
  select * into target_invite from public.invites
    where code = upper(btrim(invite_code)) and redeemed_at is null and expires_at > now() for update;
  if target_invite.id is null then raise exception 'Invite code invalid or expired'; end if;
  if exists (select 1 from public.members where user_id = auth.uid() and coalesce(status, 'active') = 'active') then
    raise exception 'Account already belongs to a household';
  end if;
  insert into public.members(family_id,user_id,display_name,role)
    values(target_invite.family_id,auth.uid(),btrim(display_name),'parent');
  update public.invites set redeemed_at=now(),redeemed_by=auth.uid() where id=target_invite.id;
  return target_invite.family_id;
end;
$$;

-- Ensure limited profile access is active-only.
create or replace function public.member_profile_access(target_member_id uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare target public.members%rowtype; actor public.members%rowtype;
begin
  select * into target from public.members where id=target_member_id;
  if target.id is null or coalesce(target.status,'active') <> 'active' then return 'none'; end if;
  select * into actor from public.members where family_id=target.family_id and user_id=auth.uid() and coalesce(status,'active')='active' limit 1;
  if actor.id is null then return 'none'; end if;
  if actor.role in ('admin','parent') and (actor.id=target.id or target.role='child') then return 'full'; end if;
  if actor.role='child' and actor.id=target.id then return 'limited'; end if;
  return 'none';
end;
$$;

-- ============================================================
-- Chores and allowance
-- ============================================================

create or replace function public.effective_task_assignee(p_task_id uuid, p_occurrence_date date)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select o.assignee_member_id from public.occurrence_overrides o
      where o.series_type='task' and o.series_id=p_task_id and o.occurrence_date=p_occurrence_date and not o.cancelled limit 1),
    (select h.member_id from public.series_assignment_history h
      where h.series_type='task' and h.series_id=p_task_id and h.effective_from <= p_occurrence_date
      order by h.effective_from desc limit 1),
    (select c.assigned_to from public.chores c where c.id=p_task_id)
  );
$$;

drop policy if exists "select chores in own family" on public.chores;
create policy "read permitted chores" on public.chores for select to authenticated using (
  public.is_active_family_adult(family_id)
  or (
    public.is_active_family_member(family_id)
    and (
      assigned_to = public.current_active_member_id()
      or exists(select 1 from public.occurrence_overrides o where o.series_type='task' and o.series_id=chores.id and o.assignee_member_id=public.current_active_member_id())
      or exists(select 1 from public.series_assignment_history h where h.series_type='task' and h.series_id=chores.id and h.member_id=public.current_active_member_id())
    )
  )
);

drop policy if exists "select completions in own family" on public.chore_completions;
create policy "read permitted chore completions" on public.chore_completions for select to authenticated using (
  completed_by = public.current_active_member_id()
  or exists(select 1 from public.chores c where c.id=chore_completions.chore_id and public.is_active_family_adult(c.family_id))
);
drop policy if exists "create completions in own family" on public.chore_completions;
create policy "create permitted chore completions" on public.chore_completions for insert to authenticated with check (
  exists(
    select 1 from public.chores c
    where c.id=chore_completions.chore_id
      and (
        (public.is_active_family_adult(c.family_id) and public.can_current_actor_act_for_member(chore_completions.completed_by))
        or (
          public.is_current_child(chore_completions.completed_by)
          and public.effective_task_assignee(c.id,coalesce(chore_completions.occurrence_due_date,c.due_date,current_date))=chore_completions.completed_by
        )
      )
  )
);

drop policy if exists "select ledger in own family" on public.allowance_ledger;
create policy "read permitted allowance ledger" on public.allowance_ledger for select to authenticated using (
  public.is_active_family_adult(family_id) or member_id=public.current_active_member_id()
);
drop policy if exists "select allowance plans in own family" on public.allowance_plans;
create policy "read permitted allowance plans" on public.allowance_plans for select to authenticated using (
  public.is_active_family_adult(family_id) or member_id=public.current_active_member_id()
);
drop policy if exists "select allowance requirements in own family" on public.allowance_plan_requirements;
create policy "read permitted allowance requirements" on public.allowance_plan_requirements for select to authenticated using (
  exists(select 1 from public.allowance_plans p where p.id=plan_id and (public.is_active_family_adult(p.family_id) or p.member_id=public.current_active_member_id()))
);
drop policy if exists "select allowance cycles in own family" on public.allowance_cycles;
create policy "read permitted allowance cycles" on public.allowance_cycles for select to authenticated using (
  exists(select 1 from public.allowance_plans p where p.id=plan_id and (public.is_active_family_adult(p.family_id) or p.member_id=public.current_active_member_id()))
);

drop policy if exists "read occurrence overrides in own family" on public.occurrence_overrides;
create policy "read permitted occurrence overrides" on public.occurrence_overrides for select to authenticated using (
  public.is_active_family_adult(family_id)
  or (series_type='task' and assignee_member_id=public.current_active_member_id())
  or (series_type='activity' and exists(select 1 from public.activity_participants ap where ap.activity_id=occurrence_overrides.series_id and ap.member_id=public.current_active_member_id()))
);
drop policy if exists "read assignment history in own family" on public.series_assignment_history;
create policy "read permitted assignment history" on public.series_assignment_history for select to authenticated using (
  public.is_active_family_adult(family_id)
  or (series_type='task' and member_id=public.current_active_member_id())
  or (series_type='activity' and exists(select 1 from public.activity_participants ap where ap.activity_id=series_assignment_history.series_id and ap.member_id=public.current_active_member_id()))
);

create or replace function public.prepare_chore_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare definition public.chores%rowtype; effective_assignee uuid; overridden boolean := false; occurrence_date date; actor_id uuid; actor_is_adult boolean;
begin
  select * into definition from public.chores where id=new.chore_id for update;
  if definition.id is null then raise exception 'Task not found'; end if;
  if definition.status <> 'active' then raise exception 'Archived task cannot be completed'; end if;
  actor_id := public.current_active_member_id();
  actor_is_adult := public.is_active_family_adult(definition.family_id);
  if actor_id is null then raise exception 'Active household membership required'; end if;
  occurrence_date := coalesce(new.occurrence_due_date,definition.due_date,current_date);
  effective_assignee := public.effective_task_assignee(definition.id,occurrence_date);
  overridden := exists(select 1 from public.occurrence_overrides o where o.series_type='task' and o.series_id=definition.id and o.occurrence_date=occurrence_date and not o.cancelled);
  if not actor_is_adult and (effective_assignee is null or actor_id <> effective_assignee) then
    raise exception 'A child can complete only their effective assignment';
  end if;
  new.completed_by := coalesce(effective_assignee, actor_id);
  new.occurrence_due_date := occurrence_date;
  new.chore_title := definition.title;
  new.reward_amount := case when definition.reward_enabled then definition.reward_amount else 0 end;
  new.reward_enabled := definition.reward_enabled;
  new.requires_approval := definition.requires_approval;
  new.assigned_member_id := effective_assignee;
  new.assignment_was_override := overridden;
  new.task_category := definition.category;
  new.status := case when definition.requires_approval then 'pending_approval' else 'approved' end;
  new.approved_by := null;
  new.approved_at := case when definition.requires_approval then null else now() end;
  return new;
end;
$$;

create or replace function public.complete_household_task(p_task_id uuid,p_occurrence_date date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare definition public.chores%rowtype; actor_id uuid; effective_assignee uuid; completion public.chore_completions%rowtype; next_due date; ledger_id uuid; occurrence_date date;
begin
  select * into definition from public.chores where id=p_task_id for update;
  if definition.id is null or not public.is_active_family_member(definition.family_id) then raise exception 'Task not found'; end if;
  actor_id := public.current_active_member_id();
  occurrence_date := coalesce(p_occurrence_date,definition.due_date,current_date);
  effective_assignee := public.effective_task_assignee(definition.id,occurrence_date);
  if not public.is_active_family_adult(definition.family_id) and actor_id is distinct from effective_assignee then
    raise exception 'A child can complete only their effective assignment';
  end if;
  if exists(select 1 from public.chore_completions where chore_id=definition.id and occurrence_due_date=occurrence_date and status in ('pending_approval','approved')) then
    raise exception 'This task occurrence is already completed';
  end if;
  insert into public.chore_completions(chore_id,completed_by,occurrence_due_date)
    values(definition.id,actor_id,occurrence_date) returning * into completion;
  if completion.status='approved' then
    if completion.reward_enabled and completion.reward_amount>0 then
      insert into public.allowance_ledger(family_id,member_id,amount,reason,entry_type,source_chore_completion_id,created_by)
      values(definition.family_id,completion.completed_by,completion.reward_amount,completion.chore_title,'chore_reward',completion.id,auth.uid()) returning id into ledger_id;
    end if;
    if definition.recurrence_type='none' then update public.chores set status='archived' where id=definition.id;
    else
      next_due := public.get_next_chore_due_date(definition.recurrence_type,completion.occurrence_due_date,current_date,definition.recurrence_weekdays,definition.preferred_day_of_month);
      update public.chores set due_date=next_due where id=definition.id;
    end if;
  end if;
  return jsonb_build_object('completion_id',completion.id,'status',completion.status,'next_due_date',next_due,'ledger_id',ledger_id);
end;
$$;

create or replace function public.reject_chore_completion(completion_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare family_id uuid; current_status text; approver_id uuid;
begin
  select c.family_id,cc.status into family_id,current_status from public.chore_completions cc join public.chores c on c.id=cc.chore_id where cc.id=completion_id for update of cc;
  if family_id is null then raise exception 'Completion not found'; end if;
  if not public.is_active_family_adult(family_id) then raise exception 'Not authorized'; end if;
  if current_status <> 'pending_approval' then raise exception 'Completion is not pending approval'; end if;
  approver_id := public.current_active_member_id();
  update public.chore_completions set status='rejected',approved_by=approver_id,approved_at=now() where id=completion_id;
end;
$$;

-- ============================================================
-- Activities, calendar sources, and medical records
-- ============================================================

create or replace function public.can_current_actor_read_activity(p_activity_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.activities a
    where a.id=p_activity_id
      and (
        public.is_active_family_adult(a.family_id)
        or (
          public.is_active_family_member(a.family_id)
          and (
            a.child_id=public.current_active_member_id()
            or exists(select 1 from public.activity_participants ap where ap.activity_id=a.id and ap.member_id=public.current_active_member_id())
            or exists(select 1 from public.activity_participant_history aph where aph.activity_id=a.id and aph.member_id=public.current_active_member_id())
          )
        )
      )
  );
$$;

drop policy if exists "select activities in own family" on public.activities;
create policy "read permitted activities" on public.activities for select to authenticated
using (public.can_current_actor_read_activity(id));

drop policy if exists "select activity participants in own family" on public.activity_participants;
create policy "read permitted activity participants" on public.activity_participants for select to authenticated using (
  public.can_current_actor_read_activity(activity_id)
);

drop policy if exists "read activity participant history in own family" on public.activity_participant_history;
create policy "read permitted activity participant history" on public.activity_participant_history for select to authenticated using (
  public.is_active_family_adult(family_id)
  or public.can_current_actor_read_activity(activity_id)
);

drop policy if exists "select medical records in own family" on public.medical_records;
create policy "read permitted medical records" on public.medical_records for select to authenticated using (
  public.is_active_family_adult(family_id)
  or (public.is_active_family_member(family_id) and patient_id=public.current_active_member_id())
);

-- ============================================================
-- Meal library, plan, and self-only child voting
-- ============================================================

drop policy if exists "select meals in own family" on public.meals;
create policy "active members read meals" on public.meals for select to authenticated using (public.is_active_family_member(family_id));
drop policy if exists "select vote rounds in own family" on public.meal_vote_rounds;
create policy "active members read vote rounds" on public.meal_vote_rounds for select to authenticated using (public.is_active_family_member(family_id));
drop policy if exists "select vote candidates in own family" on public.meal_vote_candidates;
create policy "active members read vote candidates" on public.meal_vote_candidates for select to authenticated using (
  exists(select 1 from public.meal_vote_rounds r where r.id=meal_vote_candidates.round_id and public.is_active_family_member(r.family_id))
);
drop policy if exists "select votes in own family" on public.meal_votes;
create policy "active members read meal votes" on public.meal_votes for select to authenticated using (
  exists(select 1 from public.meal_vote_candidates c join public.meal_vote_rounds r on r.id=c.round_id where c.id=meal_votes.candidate_id and public.is_active_family_member(r.family_id))
);
drop policy if exists "insert votes while round open" on public.meal_votes;
create policy "cast permitted meal votes" on public.meal_votes for insert to authenticated with check (
  created_by=auth.uid()
  and exists(
    select 1 from public.meal_vote_candidates c join public.meal_vote_rounds r on r.id=c.round_id
    where c.id=meal_votes.candidate_id and r.status='open'
      and (public.is_active_family_adult(r.family_id) or public.is_current_child(meal_votes.member_id))
      and exists(select 1 from public.members m where m.id=meal_votes.member_id and m.family_id=r.family_id and coalesce(m.status,'active')='active')
  )
);
drop policy if exists "update votes while round open" on public.meal_votes;
create policy "change permitted meal votes" on public.meal_votes for update to authenticated using (
  exists(
    select 1 from public.meal_vote_candidates c join public.meal_vote_rounds r on r.id=c.round_id
    where c.id=meal_votes.candidate_id and r.status='open'
      and (public.is_active_family_adult(r.family_id) or public.is_current_child(meal_votes.member_id))
  )
) with check (
  exists(
    select 1 from public.meal_vote_candidates c join public.meal_vote_rounds r on r.id=c.round_id
    where c.id=meal_votes.candidate_id and r.status='open'
      and (public.is_active_family_adult(r.family_id) or public.is_current_child(meal_votes.member_id))
      and exists(select 1 from public.members m where m.id=meal_votes.member_id and m.family_id=r.family_id and coalesce(m.status,'active')='active')
  )
);

create or replace function public.enforce_child_meal_vote_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.members%rowtype;
begin
  if auth.role()='service_role' then return new; end if;
  select * into actor from public.members where user_id=auth.uid() and coalesce(status,'active')='active' limit 1;
  if actor.id is null then raise exception 'Active household membership required'; end if;
  if actor.role='child' and (
    new.id is distinct from old.id
    or new.candidate_id is distinct from old.candidate_id
    or new.member_id is distinct from old.member_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then raise exception 'A child may change only their vote value'; end if;
  return new;
end;
$$;

drop trigger if exists child_meal_vote_update_guard on public.meal_votes;
create trigger child_meal_vote_update_guard before update on public.meal_votes
for each row execute function public.enforce_child_meal_vote_update();

drop policy if exists "select plan entries in own family" on public.meal_plan_entries;
create policy "active members read meal plan" on public.meal_plan_entries for select to authenticated using (public.is_active_family_member(family_id));

-- ============================================================
-- Shopping: shared read, self-add/self-toggle for children, adult admin
-- ============================================================

drop policy if exists "family members read shopping items" on public.shopping_items;
create policy "active members read shopping items" on public.shopping_items for select to authenticated using (public.is_active_family_member(family_id));
drop policy if exists "family members create shopping items" on public.shopping_items;
create policy "create permitted shopping items" on public.shopping_items for insert to authenticated with check (
  public.is_active_family_adult(family_id)
  or (
    public.is_current_child(created_by_member_id)
    and family_id=public.current_active_family_id()
    and (responsible_member_id is null or responsible_member_id=created_by_member_id)
    and purchased=false and purchased_by_member_id is null and purchased_at is null and archived_at is null
    and source_meal_id is null and source_meal_plan_entry_id is null
  )
);
drop policy if exists "family members update shopping items" on public.shopping_items;
create policy "active adults update shopping items" on public.shopping_items for update to authenticated
using (public.is_active_family_adult(family_id)) with check (public.is_active_family_adult(family_id));
drop policy if exists "family members delete shopping items" on public.shopping_items;
create policy "active adults delete shopping items" on public.shopping_items for delete to authenticated using (public.is_active_family_adult(family_id));

-- Security-definer shopping functions and offline replay still pass through
-- this trigger. Children may only add a safe self-authored row, increase an
-- identical item's quantity as add semantics, or toggle purchased state.
create or replace function public.enforce_child_shopping_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.members%rowtype; toggle_only boolean; merge_only boolean;
begin
  if auth.role()='service_role' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select * into actor from public.members where user_id=auth.uid() and coalesce(status,'active')='active' limit 1;
  if actor.id is null then raise exception 'Active household membership required'; end if;
  if actor.role in ('admin','parent') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='DELETE' then raise exception 'Children cannot delete shopping items'; end if;
  if tg_op='INSERT' then
    if new.family_id<>actor.family_id or new.created_by_member_id<>actor.id
      or new.responsible_member_id is not null and new.responsible_member_id<>actor.id
      or new.purchased or new.purchased_by_member_id is not null or new.purchased_at is not null or new.archived_at is not null
      or new.source_meal_id is not null or new.source_meal_plan_entry_id is not null or new.sort_order<>0 then
      raise exception 'Child shopping item is not permitted';
    end if;
    return new;
  end if;
  if old.family_id<>actor.family_id or new.family_id<>old.family_id then raise exception 'Shopping item is not permitted'; end if;
  toggle_only := new.name is not distinct from old.name
    and new.id is not distinct from old.id
    and new.family_id is not distinct from old.family_id
    and new.normalized_name is not distinct from old.normalized_name
    and new.quantity is not distinct from old.quantity
    and new.unit is not distinct from old.unit
    and new.note is not distinct from old.note
    and new.category is not distinct from old.category
    and new.created_by_member_id is not distinct from old.created_by_member_id
    and new.responsible_member_id is not distinct from old.responsible_member_id
    and new.sort_order is not distinct from old.sort_order
    and new.source_meal_id is not distinct from old.source_meal_id
    and new.source_meal_plan_entry_id is not distinct from old.source_meal_plan_entry_id
    and new.created_at is not distinct from old.created_at
    and (new.archived_at is not distinct from old.archived_at or (not new.purchased and new.archived_at is null))
    and (not new.purchased or new.purchased_by_member_id=actor.id)
    and (new.purchased or new.purchased_by_member_id is null);
  merge_only := new.name is not distinct from old.name
    and new.id is not distinct from old.id
    and new.family_id is not distinct from old.family_id
    and new.normalized_name is not distinct from old.normalized_name
    and new.unit is not distinct from old.unit
    and new.note is not distinct from old.note
    and new.category is not distinct from old.category
    and new.created_by_member_id is not distinct from old.created_by_member_id
    and new.responsible_member_id is not distinct from old.responsible_member_id
    and new.purchased is not distinct from old.purchased
    and new.purchased_by_member_id is not distinct from old.purchased_by_member_id
    and new.purchased_at is not distinct from old.purchased_at
    and new.archived_at is not distinct from old.archived_at
    and new.sort_order is not distinct from old.sort_order
    and new.source_meal_id is not distinct from old.source_meal_id
    and new.source_meal_plan_entry_id is not distinct from old.source_meal_plan_entry_id
    and new.created_at is not distinct from old.created_at
    and new.quantity is not null and old.quantity is not null and new.quantity>old.quantity;
  if not toggle_only and not merge_only then raise exception 'Children may only add or toggle shopping items'; end if;
  return new;
end;
$$;

drop trigger if exists child_shopping_write_guard on public.shopping_items;
create trigger child_shopping_write_guard before insert or update or delete on public.shopping_items
for each row execute function public.enforce_child_shopping_write();

create or replace function public.archive_purchased_shopping_items(p_family_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if not public.is_active_family_adult(p_family_id) then raise exception 'Adult membership required'; end if;
  update public.shopping_items set archived_at=now(),updated_at=now() where family_id=p_family_id and purchased=true and archived_at is null;
  get diagnostics affected=row_count; return affected;
end;
$$;

create or replace function public.import_shopping_items(p_family_id uuid,p_items jsonb,p_source_meal_id uuid default null,p_source_meal_plan_entry_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; result jsonb; action text; added integer:=0; merged integer:=0; skipped integer:=0; failed integer:=0;
begin
  if not public.is_active_family_adult(p_family_id) then raise exception 'Adult membership required'; end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'Items must be an array'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    begin
      result:=public.add_shopping_item(p_family_id,item->>'name',nullif(item->>'quantity','')::numeric,item->>'unit',item->>'note',coalesce(item->>'category','other'),nullif(item->>'responsibleMemberId','')::uuid,p_source_meal_id,p_source_meal_plan_entry_id,false);
      action:=result->>'action';
      if action='added' then added:=added+1; elsif action='merged' then merged:=merged+1; else skipped:=skipped+1; end if;
    exception when others then failed:=failed+1;
    end;
  end loop;
  return jsonb_build_object('added',added,'merged',merged,'skipped',skipped,'failed',failed);
end;
$$;

create or replace function public.reorder_shopping_items(p_family_id uuid,p_moved_item_id uuid,p_target_category text,p_ordered_target_ids uuid[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare item_id uuid; position bigint:=1024;
begin
  if not public.is_active_family_adult(p_family_id) then raise exception 'Adult membership required'; end if;
  if p_target_category not in ('produce','bakery','meat','dairy','household','pharmacy','other') then raise exception 'Invalid shopping category'; end if;
  if not exists(select 1 from public.shopping_items where id=p_moved_item_id and family_id=p_family_id and purchased=false and archived_at is null) then raise exception 'Shopping item not found'; end if;
  if not p_moved_item_id=any(coalesce(p_ordered_target_ids,array[]::uuid[])) then raise exception 'Target order must contain moved item'; end if;
  if coalesce(array_length(p_ordered_target_ids,1),0)<>(select count(distinct value) from unnest(coalesce(p_ordered_target_ids,array[]::uuid[])) value) then raise exception 'Duplicate shopping IDs'; end if;
  if exists(select 1 from unnest(coalesce(p_ordered_target_ids,array[]::uuid[])) value left join public.shopping_items i on i.id=value and i.family_id=p_family_id and i.purchased=false and i.archived_at is null where i.id is null) then raise exception 'Shopping item outside household'; end if;
  update public.shopping_items set category=p_target_category where id=p_moved_item_id and family_id=p_family_id;
  foreach item_id in array coalesce(p_ordered_target_ids,array[]::uuid[]) loop
    update public.shopping_items set sort_order=position where id=item_id and family_id=p_family_id and category=p_target_category;
    position:=position+1024;
  end loop;
end;
$$;

-- Wrap the existing durable offline implementation with per-action auth.
do $$ begin
  if to_regprocedure('public._apply_shopping_mutation_internal(uuid,uuid,text,uuid,jsonb)') is null then
    alter function public.apply_shopping_mutation(uuid,uuid,text,uuid,jsonb) rename to _apply_shopping_mutation_internal;
  end if;
end $$;

create or replace function public.apply_shopping_mutation(p_mutation_id uuid,p_family_id uuid,p_mutation_type text,p_item_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.members%rowtype;
begin
  select * into actor from public.members where family_id=p_family_id and user_id=auth.uid() and coalesce(status,'active')='active' limit 1;
  if actor.id is null then raise exception 'Not authorized for this family'; end if;
  if actor.role='child' and p_mutation_type not in ('create','toggle') then raise exception 'Shopping mutation requires an adult'; end if;
  return public._apply_shopping_mutation_internal(p_mutation_id,p_family_id,p_mutation_type,p_item_id,p_payload);
end;
$$;

revoke all on function public._apply_shopping_mutation_internal(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;

-- ============================================================
-- Own reminders/preferences/push remain self-scoped, now active-only
-- ============================================================

drop policy if exists "members read own notification preferences" on public.notification_preferences;
drop policy if exists "members create own notification preferences" on public.notification_preferences;
drop policy if exists "members update own notification preferences" on public.notification_preferences;
create policy "active members read own notification preferences" on public.notification_preferences for select to authenticated using (member_id=public.current_active_member_id() and family_id=public.current_active_family_id());
create policy "active members create own notification preferences" on public.notification_preferences for insert to authenticated with check (member_id=public.current_active_member_id() and family_id=public.current_active_family_id());
create policy "active members update own notification preferences" on public.notification_preferences for update to authenticated using (member_id=public.current_active_member_id() and family_id=public.current_active_family_id()) with check (member_id=public.current_active_member_id() and family_id=public.current_active_family_id());
drop policy if exists "members read own reminders" on public.reminders;
create policy "active members read own reminders" on public.reminders for select to authenticated using (target_member_id=public.current_active_member_id() and family_id=public.current_active_family_id());
drop policy if exists "users read own push devices" on public.push_subscriptions;
create policy "active members read own push devices" on public.push_subscriptions for select to authenticated using (user_id=auth.uid() and target_member_id=public.current_active_member_id() and family_id=public.current_active_family_id());

-- ============================================================
-- Function execution surface
-- ============================================================

-- PostgreSQL grants EXECUTE to PUBLIC by default. Remove that inherited path
-- for every public function, then explicitly restore only application APIs.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.current_active_member_id() to authenticated;
grant execute on function public.current_active_family_id() to authenticated;
grant execute on function public.is_active_family_member(uuid) to authenticated;
grant execute on function public.is_active_family_adult(uuid) to authenticated;
grant execute on function public.is_current_child(uuid) to authenticated;
grant execute on function public.can_current_actor_act_for_member(uuid) to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_parent(uuid) to authenticated;
grant execute on function public.effective_task_assignee(uuid,date) to authenticated;

grant execute on function public.create_family(text,text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.redeem_invite(text,text) to authenticated;
grant execute on function public.member_profile_access(uuid) to authenticated;
grant execute on function public.can_current_actor_read_activity(uuid) to authenticated;
grant execute on function public.can_read_member_avatar(text) to authenticated;
grant execute on function public.can_manage_member_avatar(text) to authenticated;
grant execute on function public.update_member_profile(uuid,text,date,text,text,text,text) to authenticated;
grant execute on function public.can_read_family_hero_image(text) to authenticated;
grant execute on function public.can_manage_family_hero_image(text) to authenticated;
grant execute on function public.complete_household_task(uuid,date) to authenticated;
grant execute on function public.approve_chore_completion(uuid,date) to authenticated;
grant execute on function public.reject_chore_completion(uuid) to authenticated;
grant execute on function public.record_payout(uuid,numeric,text) to authenticated;
grant execute on function public.save_allowance_plan(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.credit_monthly_allowance(uuid,date) to authenticated;
grant execute on function public.skip_monthly_allowance(uuid,date) to authenticated;
grant execute on function public.reorder_household_tasks(uuid,uuid[]) to authenticated;
grant execute on function public.set_occurrence_member_override(text,uuid,date,uuid,boolean) to authenticated;
grant execute on function public.create_activity_with_participants(jsonb,uuid[]) to authenticated;
grant execute on function public.update_activity_with_participants(uuid,jsonb,uuid[]) to authenticated;
grant execute on function public.open_vote_round(uuid) to authenticated;
grant execute on function public.close_vote_round(uuid) to authenticated;
grant execute on function public.add_shopping_item(uuid,text,numeric,text,text,text,uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.set_shopping_item_purchased(uuid,boolean) to authenticated;
grant execute on function public.archive_purchased_shopping_items(uuid) to authenticated;
grant execute on function public.import_shopping_items(uuid,jsonb,uuid,uuid) to authenticated;
grant execute on function public.replace_meal_ingredients(uuid,jsonb) to authenticated;
grant execute on function public.reorder_shopping_items(uuid,uuid,text,uuid[]) to authenticated;
grant execute on function public.apply_shopping_mutation(uuid,uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.sync_member_reminders(uuid,jsonb) to authenticated;
grant execute on function public.set_member_reminder_state(uuid,uuid[],text) to authenticated;
grant execute on function public.register_push_subscription(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.revoke_push_subscription(uuid) to authenticated;
grant execute on function public.queue_test_notification(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid,uuid,text,text,text,boolean) to authenticated;
grant execute on function public.restore_household_member(uuid) to authenticated;
grant execute on function public.permanently_delete_removed_member(uuid) to authenticated;

-- Service-only APIs must remain callable after the blanket PUBLIC revoke.
grant execute on function public.begin_child_account_provision(uuid,uuid,text,text) to service_role;
grant execute on function public.finalize_child_account_provision(uuid,uuid,uuid) to service_role;
grant execute on function public.abort_child_account_provision(uuid,uuid) to service_role;
grant execute on function public.record_child_account_password_reset(uuid,uuid) to service_role;
grant execute on function public.detach_child_account_access(uuid,uuid) to service_role;

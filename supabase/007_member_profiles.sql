-- ============================================================
-- Rodinka — editable member profiles and private avatars
-- Run this AFTER 006_meal_planning.sql
-- ============================================================

alter table members
  add column color_key text,
  add column avatar_path text,
  add column grammatical_gender text,
  add column updated_at timestamptz not null default now();

alter table members
  add constraint members_color_key_check
    check (color_key is null or color_key in ('brick', 'coral', 'sky', 'sage', 'honey', 'lavender', 'berry')),
  add constraint members_grammatical_gender_check
    check (grammatical_gender is null or grammatical_gender in ('masculine', 'feminine', 'neutral'));

-- One permission definition is shared by the profile RPC and avatar
-- Storage policies. "full" may change all profile fields, "limited" may
-- only change color/avatar/wording, and "none" has no profile access.
create or replace function member_profile_access(target_member_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_target members%rowtype;
  v_actor members%rowtype;
begin
  if auth.uid() is null then
    return 'none';
  end if;

  select * into v_target
  from members
  where id = target_member_id;

  if not found then
    return 'none';
  end if;

  select * into v_actor
  from members
  where family_id = v_target.family_id
    and user_id = auth.uid()
  limit 1;

  if not found then
    return 'none';
  end if;

  if v_actor.role in ('admin', 'parent')
    and (v_actor.id = v_target.id or v_target.role = 'child') then
    return 'full';
  end if;

  if v_actor.role = 'child' and v_actor.id = v_target.id then
    return 'limited';
  end if;

  return 'none';
end;
$$;

-- Paths are deliberately compared as text. A malformed path can never
-- cause a UUID cast exception inside an RLS policy.
create or replace function is_member_avatar_path(
  object_name text,
  target_family_id uuid,
  target_member_id uuid
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    cardinality(string_to_array(object_name, '/')) = 3
    and split_part(object_name, '/', 1) = target_family_id::text
    and split_part(object_name, '/', 2) = target_member_id::text
    and split_part(object_name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|webp)$';
$$;

create or replace function can_read_member_avatar(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from members m
    where is_member_avatar_path(object_name, m.family_id, m.id)
      and is_family_member(m.family_id)
  );
$$;

create or replace function can_manage_member_avatar(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from members m
    where is_member_avatar_path(object_name, m.family_id, m.id)
      and member_profile_access(m.id) in ('full', 'limited')
  );
$$;

create or replace function update_member_profile(
  p_target_member_id uuid,
  p_display_name text,
  p_birth_date date,
  p_color_key text,
  p_avatar_path text,
  p_grammatical_gender text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target members%rowtype;
  v_access text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_target
  from members
  where id = p_target_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  v_access := member_profile_access(v_target.id);

  if v_access = 'none' then
    raise exception 'Not authorized to update this profile';
  end if;

  if p_color_key is not null
    and p_color_key not in ('brick', 'coral', 'sky', 'sage', 'honey', 'lavender', 'berry') then
    raise exception 'Unsupported member color';
  end if;

  if p_grammatical_gender is not null
    and p_grammatical_gender not in ('masculine', 'feminine', 'neutral') then
    raise exception 'Unsupported grammatical gender';
  end if;

  if p_avatar_path is not null
    and not is_member_avatar_path(p_avatar_path, v_target.family_id, v_target.id) then
    raise exception 'Invalid avatar path';
  end if;

  if v_access = 'limited' then
    if p_display_name is distinct from v_target.display_name
      or p_birth_date is distinct from v_target.birth_date then
      raise exception 'A child account cannot change name or birth date';
    end if;

    update members
    set color_key = p_color_key,
        avatar_path = p_avatar_path,
        grammatical_gender = p_grammatical_gender,
        updated_at = now()
    where id = v_target.id;
    return;
  end if;

  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'Display name is required';
  end if;

  update members
  set display_name = btrim(p_display_name),
      birth_date = p_birth_date,
      color_key = p_color_key,
      avatar_path = p_avatar_path,
      grammatical_gender = p_grammatical_gender,
      updated_at = now()
  where id = v_target.id;
end;
$$;

revoke execute on function member_profile_access(uuid) from public;
revoke execute on function can_read_member_avatar(text) from public;
revoke execute on function can_manage_member_avatar(text) from public;
revoke execute on function update_member_profile(uuid, text, date, text, text, text) from public;

grant execute on function member_profile_access(uuid) to authenticated;
grant execute on function can_read_member_avatar(text) to authenticated;
grant execute on function can_manage_member_avatar(text) to authenticated;
grant execute on function update_member_profile(uuid, text, date, text, text, text) to authenticated;

-- Profiles can only be updated through update_member_profile(), preventing
-- direct changes to role, family_id, user_id, or created_at.
drop policy if exists "update members in own family" on members;

-- Direct member creation is only the simple parent-managed child flow.
-- create_family() and redeem_invite() remain security-definer functions and
-- therefore keep their existing admin/parent creation flows.
drop policy if exists "insert members into own family" on members;
create policy "parents can add children to own family"
  on members for insert
  to authenticated
  with check (
    is_family_parent(family_id)
    and role = 'child'
    and user_id is null
  );

-- Private bucket configuration is complete and idempotent; no Dashboard
-- setup is required. SVG is intentionally omitted because it can contain
-- active content.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-avatars',
  'member-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "family members can read member avatars" on storage.objects;
create policy "family members can read member avatars"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'member-avatars'
    and can_read_member_avatar(name)
  );

drop policy if exists "profile editors can upload member avatars" on storage.objects;
create policy "profile editors can upload member avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'member-avatars'
    and can_manage_member_avatar(name)
  );

drop policy if exists "profile editors can replace member avatars" on storage.objects;
create policy "profile editors can replace member avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'member-avatars'
    and can_manage_member_avatar(name)
  )
  with check (
    bucket_id = 'member-avatars'
    and can_manage_member_avatar(name)
  );

drop policy if exists "profile editors can delete member avatars" on storage.objects;
create policy "profile editors can delete member avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'member-avatars'
    and can_manage_member_avatar(name)
  );


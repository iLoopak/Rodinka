-- ============================================================
-- Family Organizer — Phase 0 functions
-- Run this AFTER schema.sql in the Supabase SQL Editor
-- ============================================================

-- Creates a new family AND makes the calling user its first admin member,
-- in one atomic step. This is how a parent starts using the app for the
-- first time (no family exists yet, so no RLS policy could let them insert
-- into `families` directly — this function runs as the definer instead).
create or replace function create_family(family_name text, admin_display_name text)
returns uuid as $$
declare
  new_family_id uuid;
begin
  insert into families (name) values (family_name)
  returning id into new_family_id;

  insert into members (family_id, user_id, display_name, role)
  values (new_family_id, auth.uid(), admin_display_name, 'admin');

  return new_family_id;
end;
$$ language plpgsql security definer;

-- Generates a short, human-friendly invite code and creates an invite row.
-- Only callable by an existing member of the family (enforced by RLS on invites).
create or replace function create_invite(fid uuid)
returns text as $$
declare
  new_code text;
begin
  -- simple readable code: 6 uppercase alphanumeric chars
  new_code := upper(substring(md5(random()::text) from 1 for 6));

  insert into invites (family_id, code, created_by)
  values (fid, new_code, auth.uid());

  return new_code;
end;
$$ language plpgsql security definer;

-- Redeems an invite code: adds the calling user as a 'parent' member
-- of the family tied to that code, and marks the invite as used.
create or replace function redeem_invite(invite_code text, display_name text)
returns uuid as $$
declare
  target_family_id uuid;
begin
  select family_id into target_family_id
  from invites
  where code = invite_code
    and redeemed_at is null
    and expires_at > now();

  if target_family_id is null then
    raise exception 'Invite code invalid or expired';
  end if;

  insert into members (family_id, user_id, display_name, role)
  values (target_family_id, auth.uid(), display_name, 'parent');

  update invites
  set redeemed_at = now(), redeemed_by = auth.uid()
  where code = invite_code;

  return target_family_id;
end;
$$ language plpgsql security definer;

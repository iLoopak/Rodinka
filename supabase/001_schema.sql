-- ============================================================
-- Family Organizer — Phase 0 schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================

-- Families: the top-level shared tenant
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Members: a person in a family (parent OR child — child may have no auth user)
create table members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- null for kids with no login
  display_name text not null,
  role text not null check (role in ('admin', 'parent', 'child')),
  birth_date date, -- optional, useful for age-appropriate features later
  created_at timestamptz not null default now()
);

-- Invites: lets a second parent join an existing family
create table invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  code text not null unique, -- short human-friendly code, e.g. "SUNNY-FOX-42"
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id)
);

-- ============================================================
-- Row Level Security — this is what keeps families isolated from each other
-- ============================================================

alter table families enable row level security;
alter table members enable row level security;
alter table invites enable row level security;

-- Helper: is the current authenticated user a member of this family?
create or replace function is_family_member(fid uuid)
returns boolean as $$
  select exists (
    select 1 from members
    where family_id = fid and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Families: only members of a family can see/update it
create policy "select own family"
  on families for select
  using (is_family_member(id));

create policy "update own family if admin"
  on families for update
  using (
    exists (
      select 1 from members
      where family_id = families.id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Members: only visible to people in the same family
create policy "select members of own family"
  on members for select
  using (is_family_member(family_id));

create policy "insert members into own family"
  on members for insert
  with check (is_family_member(family_id));

create policy "update members in own family"
  on members for update
  using (is_family_member(family_id));

-- Invites: only visible/creatable by members of that family
create policy "select invites for own family"
  on invites for select
  using (is_family_member(family_id));

create policy "create invites for own family"
  on invites for insert
  with check (is_family_member(family_id));

-- ============================================================
-- Notes:
-- - "families for insert" has no policy yet on purpose — creating a brand new
--   family happens via a server-side function (see 002_functions.sql) so we
--   can atomically create the family + the first admin member together.
-- - Kids with no login (user_id null) are represented as rows in `members`
--   but can't authenticate directly in Phase 0 — a parent manages their data.
-- ============================================================

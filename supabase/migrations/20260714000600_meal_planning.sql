-- ============================================================
-- Family Organizer — Phase 3: Meal Planning + Family Voting
-- Run this AFTER 001_schema.sql .. 005_activities_medical.sql
-- ============================================================

-- Meals: a shared, reusable family meal idea library. Deliberately
-- lightweight — no images, no ingredients/nutrition, just enough to
-- recognize and reuse an idea ("Spaghetti bolognese", "Leftovers").
-- Tags are a plain text[] rather than a tags + join-table pair (same
-- precedent as activities.recurrence_weekdays) since the set is small,
-- mixes a handful of suggested values with free-form custom ones, and
-- doesn't need relational querying beyond "does this array contain X".
create table meals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,

  name text not null,
  description text,
  category text not null default 'other'
    check (category in ('breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'other')),
  tags text[] not null default '{}',
  prep_minutes smallint,
  notes text,
  source_url text,
  status text not null default 'active' check (status in ('active', 'archived')),

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meals_family_id_idx on meals (family_id);

-- Voting rounds: "what should we eat next week?" A family keeps at most
-- one open round at a time (enforced below) but closed rounds are kept
-- for history.
create table meal_vote_rounds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,

  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  deadline_at timestamptz,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index meal_vote_rounds_family_id_idx on meal_vote_rounds (family_id);

-- Only one open round per family at a time — matches the simplified UX
-- explicitly allowed for this phase. A second attempt to open a round
-- fails here as a defensive backstop; open_vote_round() below also checks
-- this explicitly first, for a friendlier error message.
create unique index meal_vote_rounds_one_open_per_family
  on meal_vote_rounds (family_id)
  where status = 'open';

-- Candidates: which meals are up for a vote in a round. meal_title is a
-- snapshot taken when the candidate is added, so a later rename or
-- archive of the source meal never rewrites how a historical round reads.
-- meal_id is nullable (on delete set null) so removing a meal in the
-- future — not something the current UI does, meals are soft-archived —
-- still can't corrupt a historical round.
create table meal_vote_candidates (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references meal_vote_rounds(id) on delete cascade,
  meal_id uuid references meals(id) on delete set null,
  meal_title text not null,
  created_at timestamptz not null default now()
);

create index meal_vote_candidates_round_id_idx on meal_vote_candidates (round_id);

-- One candidate per meal per round (only meaningful while meal_id is
-- still set; a set-null after meal deletion shouldn't block re-adding).
create unique index meal_vote_candidates_unique_meal_per_round
  on meal_vote_candidates (round_id, meal_id)
  where meal_id is not null;

-- Votes: one row per (candidate, member). A parent can vote on behalf of
-- any member of their family (including children, who have no login of
-- their own) — created_by is who *recorded* the vote, member_id is who
-- the vote is *for*, and they may differ.
create table meal_votes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references meal_vote_candidates(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  value smallint not null check (value in (-1, 0, 1)), -- dislike / neutral / like

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (candidate_id, member_id)
);

create index meal_votes_candidate_id_idx on meal_votes (candidate_id);

-- Weekly plan entries: one row per date + meal slot. Either meal_id
-- (linked to the library, title snapshotted at add time so a later
-- rename/archive doesn't change history) or a one-off custom title —
-- never neither, enforced below. source_entry_id optionally traces a
-- "leftovers from" / "copied from" relationship back to another entry.
create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,

  entry_date date not null,
  meal_slot text not null default 'dinner'
    check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  meal_id uuid references meals(id) on delete set null,
  title text,
  responsible_member_id uuid references members(id) on delete set null,
  notes text,
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'completed', 'skipped')),
  origin text not null default 'manual' check (origin in ('manual', 'vote', 'copied')),
  source_entry_id uuid references meal_plan_entries(id) on delete set null,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meal_plan_entry_has_title check (
    meal_id is not null or (title is not null and btrim(title) <> '')
  )
);

create index meal_plan_entries_family_id_date_idx on meal_plan_entries (family_id, entry_date);

-- ============================================================
-- Row Level Security — same pattern as chores/activities/medical_records:
-- select open to is_family_member(family_id); insert/update require
-- is_family_parent(family_id) plus same-family checks on every member/meal
-- reference. meal_plan_entries additionally gets a delete policy (the
-- brief calls for "remove entries", unlike the other tables in this
-- schema which are retired via status instead of deletion).
-- ============================================================

alter table meals enable row level security;
alter table meal_vote_rounds enable row level security;
alter table meal_vote_candidates enable row level security;
alter table meal_votes enable row level security;
alter table meal_plan_entries enable row level security;

create policy "select meals in own family"
  on meals for select
  using (is_family_member(family_id));

create policy "insert meals in own family"
  on meals for insert
  with check (is_family_parent(meals.family_id));

create policy "update meals in own family"
  on meals for update
  using (is_family_parent(meals.family_id))
  with check (is_family_parent(meals.family_id));

create policy "select vote rounds in own family"
  on meal_vote_rounds for select
  using (is_family_member(family_id));

create policy "insert vote rounds in own family"
  on meal_vote_rounds for insert
  with check (is_family_parent(meal_vote_rounds.family_id));

create policy "update vote rounds in own family"
  on meal_vote_rounds for update
  using (is_family_parent(meal_vote_rounds.family_id))
  with check (is_family_parent(meal_vote_rounds.family_id));

create policy "select vote candidates in own family"
  on meal_vote_candidates for select
  using (
    exists (
      select 1 from meal_vote_rounds r
      where r.id = meal_vote_candidates.round_id and is_family_member(r.family_id)
    )
  );

-- Candidates can only be added while the round is still in draft — once
-- open, the candidate list is fixed for the vote in progress.
create policy "insert vote candidates in own family"
  on meal_vote_candidates for insert
  with check (
    exists (
      select 1 from meal_vote_rounds r
      join meals m on m.id = meal_vote_candidates.meal_id
      where r.id = meal_vote_candidates.round_id
        and r.status = 'draft'
        and is_family_parent(r.family_id)
        and m.family_id = r.family_id
    )
  );

create policy "select votes in own family"
  on meal_votes for select
  using (
    exists (
      select 1 from meal_vote_candidates c
      join meal_vote_rounds r on r.id = c.round_id
      where c.id = meal_votes.candidate_id and is_family_member(r.family_id)
    )
  );

-- Votes can only be inserted/updated while their round is open — a
-- closed round's votes become read-only history.
create policy "insert votes while round open"
  on meal_votes for insert
  with check (
    exists (
      select 1 from meal_vote_candidates c
      join meal_vote_rounds r on r.id = c.round_id
      where c.id = meal_votes.candidate_id
        and r.status = 'open'
        and is_family_parent(r.family_id)
        and exists (
          select 1 from members mem where mem.id = meal_votes.member_id and mem.family_id = r.family_id
        )
    )
  );

create policy "update votes while round open"
  on meal_votes for update
  using (
    exists (
      select 1 from meal_vote_candidates c
      join meal_vote_rounds r on r.id = c.round_id
      where c.id = meal_votes.candidate_id and r.status = 'open' and is_family_parent(r.family_id)
    )
  )
  with check (
    exists (
      select 1 from meal_vote_candidates c
      join meal_vote_rounds r on r.id = c.round_id
      where c.id = meal_votes.candidate_id
        and r.status = 'open'
        and is_family_parent(r.family_id)
        and exists (
          select 1 from members mem where mem.id = meal_votes.member_id and mem.family_id = r.family_id
        )
    )
  );

create policy "select plan entries in own family"
  on meal_plan_entries for select
  using (is_family_member(family_id));

create policy "insert plan entries in own family"
  on meal_plan_entries for insert
  with check (
    is_family_parent(meal_plan_entries.family_id)
    and (
      meal_plan_entries.meal_id is null
      or exists (select 1 from meals m where m.id = meal_plan_entries.meal_id and m.family_id = meal_plan_entries.family_id)
    )
    and (
      meal_plan_entries.responsible_member_id is null
      or exists (
        select 1 from members mem
        where mem.id = meal_plan_entries.responsible_member_id and mem.family_id = meal_plan_entries.family_id
      )
    )
  );

create policy "update plan entries in own family"
  on meal_plan_entries for update
  using (is_family_parent(meal_plan_entries.family_id))
  with check (
    is_family_parent(meal_plan_entries.family_id)
    and (
      meal_plan_entries.meal_id is null
      or exists (select 1 from meals m where m.id = meal_plan_entries.meal_id and m.family_id = meal_plan_entries.family_id)
    )
    and (
      meal_plan_entries.responsible_member_id is null
      or exists (
        select 1 from members mem
        where mem.id = meal_plan_entries.responsible_member_id and mem.family_id = meal_plan_entries.family_id
      )
    )
  );

create policy "delete plan entries in own family"
  on meal_plan_entries for delete
  using (is_family_parent(family_id));

-- ============================================================
-- Functions — atomic, validated round open/close (same style as
-- approve_chore_completion: row-locked read, permission check, business
-- rule check, then mutate, all in one statement so a client can't race
-- past the validation).
-- ============================================================

create or replace function open_vote_round(round_id uuid)
returns void as $$
declare
  v_family_id uuid;
  v_status text;
  v_candidate_count int;
begin
  select family_id, status into v_family_id, v_status
  from meal_vote_rounds
  where id = round_id
  for update;

  if v_family_id is null then
    raise exception 'Round not found';
  end if;

  if not is_family_parent(v_family_id) then
    raise exception 'Not authorized to open this round';
  end if;

  if v_status <> 'draft' then
    raise exception 'Round is not in draft status';
  end if;

  if exists (
    select 1 from meal_vote_rounds
    where family_id = v_family_id and status = 'open' and id <> round_id
  ) then
    raise exception 'Another round is already open';
  end if;

  select count(*) into v_candidate_count
  from meal_vote_candidates
  where meal_vote_candidates.round_id = open_vote_round.round_id;

  if v_candidate_count = 0 then
    raise exception 'Round has no candidates';
  end if;

  update meal_vote_rounds set status = 'open' where id = round_id;
end;
$$ language plpgsql security definer;

create or replace function close_vote_round(round_id uuid)
returns void as $$
declare
  v_family_id uuid;
  v_status text;
begin
  select family_id, status into v_family_id, v_status
  from meal_vote_rounds
  where id = round_id
  for update;

  if v_family_id is null then
    raise exception 'Round not found';
  end if;

  if not is_family_parent(v_family_id) then
    raise exception 'Not authorized to close this round';
  end if;

  if v_status <> 'open' then
    raise exception 'Round is not open';
  end if;

  update meal_vote_rounds set status = 'closed', closed_at = now() where id = round_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Notes:
-- - No delete policy on meals/meal_vote_rounds/meal_vote_candidates/
--   meal_votes — matches the rest of this schema (status fields retire a
--   record; chore/activity/medical_records tables follow the same rule).
--   meal_plan_entries is the one exception, per the brief's explicit
--   "remove entries" requirement.
-- - `updated_at` is set explicitly by the application on every update
--   call, same "explicit over implicit" convention as the rest of this
--   schema (no triggers).
-- ============================================================

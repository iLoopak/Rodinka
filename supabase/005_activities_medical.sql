-- ============================================================
-- Family Organizer — Phase 2: Activities/Clubs + Medical Tracker
-- Run this AFTER 001_schema.sql .. 004_chore_due_date.sql
-- ============================================================

-- Activities: a recurring or one-off club/lesson/camp a child attends,
-- optionally with an accompanying/responsible adult. Mirrors the
-- chores.assigned_to pattern: single FK columns to members, no join tables.
create table activities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,

  title text not null,
  category text not null default 'other'
    check (category in (
      'swimming', 'dance', 'football', 'music', 'speech_therapy',
      'club', 'camp', 'after_school', 'other'
    )),

  -- Participant vs. responsible adult are distinct roles on purpose — a
  -- young child is the participant, a parent may be the one who drives
  -- them/waits/pays. Both optional-adult columns reference members(id)
  -- directly, same as chores.assigned_to; no separate join table needed
  -- since at most two adults are ever tracked per activity.
  child_id uuid not null references members(id) on delete cascade,
  responsible_member_id uuid references members(id) on delete set null,
  secondary_responsible_member_id uuid references members(id) on delete set null,

  location text,
  coach_name text,
  coach_phone text,
  coach_email text,
  notes text,
  skill_level text,

  start_date date not null,
  end_date date,
  recurrence_type text not null default 'one_off'
    check (recurrence_type in ('one_off', 'weekly', 'biweekly', 'custom_weekdays')),
  -- ISO weekday numbers 1 (Mon) .. 7 (Sun), only meaningful when
  -- recurrence_type = 'custom_weekdays'.
  recurrence_weekdays smallint[],
  start_time time,
  end_time time,

  payment_amount numeric(10,2),
  payment_frequency text
    check (payment_frequency is null or payment_frequency in ('one_time', 'weekly', 'monthly', 'term', 'yearly')),
  next_payment_due_date date,

  status text not null default 'active' check (status in ('active', 'paused', 'finished')),

  reminder_enabled boolean not null default false,
  reminder_days_before smallint,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activities_end_date_after_start check (end_date is null or end_date >= start_date)
);

create index activities_family_id_idx on activities (family_id);
create index activities_child_id_idx on activities (child_id);

-- Medical records: visits, checkups, and vaccinations for any family
-- member. Deliberately lightweight — reminders and visit history, not a
-- clinical record system, so no diagnosis/document fields.
create table medical_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,

  patient_id uuid not null references members(id) on delete cascade,
  responsible_member_id uuid references members(id) on delete set null,

  record_type text not null default 'other'
    check (record_type in (
      'checkup', 'pediatrician', 'gp', 'dentist', 'specialist',
      'vaccination', 'screening', 'other'
    )),
  title text not null,
  provider text,
  location text,

  record_date date not null,
  start_time time,
  end_time time,
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  notes text,

  next_due_date date,
  recurrence_interval_months smallint,

  reminder_enabled boolean not null default false,
  reminder_days_before smallint,

  -- Only meaningful when record_type = 'vaccination'; left null otherwise.
  vaccine_name text,
  vaccine_dose_number smallint,
  vaccine_batch_number text,
  vaccine_completed_date date,
  vaccine_next_dose_date date,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medical_records_family_id_idx on medical_records (family_id);
create index medical_records_patient_id_idx on medical_records (patient_id);

-- ============================================================
-- Row Level Security — same pattern as chores (003_chores.sql):
-- select is open to the whole family, insert/update requires
-- is_family_parent(family_id), and every member reference must belong to
-- the same family (this is the check that was missing for
-- chores.assigned_to until 004_chore_due_date.sql; applied here from the
-- start).
-- ============================================================

alter table activities enable row level security;
alter table medical_records enable row level security;

create policy "select activities in own family"
  on activities for select
  using (is_family_member(family_id));

create policy "insert activities in own family"
  on activities for insert
  with check (
    is_family_parent(activities.family_id)
    and exists (
      select 1 from members m
      where m.id = activities.child_id and m.family_id = activities.family_id
    )
    and (
      activities.responsible_member_id is null
      or exists (
        select 1 from members m
        where m.id = activities.responsible_member_id and m.family_id = activities.family_id
      )
    )
    and (
      activities.secondary_responsible_member_id is null
      or exists (
        select 1 from members m
        where m.id = activities.secondary_responsible_member_id and m.family_id = activities.family_id
      )
    )
  );

create policy "update activities in own family"
  on activities for update
  using (is_family_parent(activities.family_id))
  with check (
    is_family_parent(activities.family_id)
    and exists (
      select 1 from members m
      where m.id = activities.child_id and m.family_id = activities.family_id
    )
    and (
      activities.responsible_member_id is null
      or exists (
        select 1 from members m
        where m.id = activities.responsible_member_id and m.family_id = activities.family_id
      )
    )
    and (
      activities.secondary_responsible_member_id is null
      or exists (
        select 1 from members m
        where m.id = activities.secondary_responsible_member_id and m.family_id = activities.family_id
      )
    )
  );

create policy "select medical records in own family"
  on medical_records for select
  using (is_family_member(family_id));

create policy "insert medical records in own family"
  on medical_records for insert
  with check (
    is_family_parent(medical_records.family_id)
    and exists (
      select 1 from members m
      where m.id = medical_records.patient_id and m.family_id = medical_records.family_id
    )
    and (
      medical_records.responsible_member_id is null
      or exists (
        select 1 from members m
        where m.id = medical_records.responsible_member_id and m.family_id = medical_records.family_id
      )
    )
  );

create policy "update medical records in own family"
  on medical_records for update
  using (is_family_parent(medical_records.family_id))
  with check (
    is_family_parent(medical_records.family_id)
    and exists (
      select 1 from members m
      where m.id = medical_records.patient_id and m.family_id = medical_records.family_id
    )
    and (
      medical_records.responsible_member_id is null
      or exists (
        select 1 from members m
        where m.id = medical_records.responsible_member_id and m.family_id = medical_records.family_id
      )
    )
  );

-- ============================================================
-- Notes:
-- - No delete policy on either table (matches chores — status fields like
--   'finished'/'cancelled' are the intended way to retire a record, not
--   deletion).
-- - `updated_at` is set explicitly by the application on every update
--   call (no trigger) — same "explicit over implicit" style already used
--   throughout this schema (e.g. approve_chore_completion sets
--   approved_at itself rather than relying on a trigger).
-- ============================================================

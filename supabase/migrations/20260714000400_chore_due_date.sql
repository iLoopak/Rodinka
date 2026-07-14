-- ============================================================
-- Family Organizer — Phase 1.5C: chore due dates + assignee family check
-- Run this AFTER 001_schema.sql, 002_functions.sql, 003_chores.sql
-- ============================================================

-- Due date: which day the chore should be completed by. Date-only (no time
-- component) on purpose — this represents "which day", not a precise
-- appointment time, and a timestamptz would risk timezone drift when
-- comparing "today" between client and server.
alter table chores add column due_date date;

-- Backfill existing rows so the column can become NOT NULL: use each
-- chore's creation date (converted to a date) rather than today, so
-- already-overdue-looking-if-blank rows get a stable, meaningful value.
update chores set due_date = created_at::date where due_date is null;

alter table chores alter column due_date set not null;
alter table chores alter column due_date set default current_date;

-- ============================================================
-- Tighten the chores insert policy.
--
-- The original policy (003_chores.sql) only checked that the caller is a
-- parent/admin of `family_id` — it never verified that `assigned_to` is
-- actually a member of that same family. Since `members.id` values aren't
-- guessable but are also not secret to other authenticated users, a client
-- bug (or a malicious one) could otherwise insert a chore scoped to the
-- caller's own family_id but assigned to a member row belonging to a
-- different family. Replace the policy with one that also requires the
-- assignee to belong to the chore's family.
-- ============================================================

drop policy "create chores in own family" on chores;

create policy "create chores in own family"
  on chores for insert
  with check (
    is_family_parent(chores.family_id)
    and exists (
      select 1 from members m
      where m.id = chores.assigned_to and m.family_id = chores.family_id
    )
  );

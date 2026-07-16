-- Enables Supabase Realtime for the tables every feature provider now
-- subscribes to (see src/realtime/ and the per-domain contexts under
-- src/context/**). `shopping_items` was already enabled in
-- 20260715200000_offline_shopping_sync.sql — this migration covers the
-- remaining domains: family members/settings, chores, allowance ledger,
-- activities, occurrence assignments, medical records, and meals.
--
-- REPLICA IDENTITY FULL is required so a family-scoped
-- `filter: 'family_id=eq.<id>'` (or `id=eq.<id>` for `families`) can be
-- evaluated on DELETE — the default replica identity only includes the
-- primary key in the old row, and family_id isn't the primary key on any
-- of these tables.
--
-- Both statements are guarded to be idempotent/safe to re-run, matching
-- the pattern already used for shopping_items.

do $$
declare
  target text;
  targets text[] := array[
    'chores',
    'chore_completions',
    'allowance_ledger',
    'activities',
    'activity_participants',
    'occurrence_overrides',
    'series_assignment_history',
    'activity_participant_history',
    'medical_records',
    'meals',
    'meal_plan_entries',
    'meal_vote_rounds',
    'meal_vote_candidates',
    'meal_votes',
    'members',
    'families'
  ];
begin
  foreach target in array targets loop
    execute format('alter table public.%I replica identity full', target);

    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
      ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

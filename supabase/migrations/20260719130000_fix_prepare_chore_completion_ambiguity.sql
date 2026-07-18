-- ============================================================
-- Fix: task completion is broken app-wide with
--   ERROR 42702: column reference "occurrence_date" is ambiguous
--
-- public.prepare_chore_completion() (introduced in
-- 20260717233000_child_occurrence_completion_guard.sql) declares a
-- PL/pgSQL variable named `occurrence_date`, then compares it against
-- public.occurrence_overrides — a table that has a column of the SAME
-- name:
--
--   overridden := exists(select 1 from public.occurrence_overrides o
--                         where ... and o.occurrence_date = occurrence_date ...)
--
-- The unqualified right-hand `occurrence_date` could be either the
-- variable or `o.occurrence_date`, so Postgres refuses to resolve it and
-- raises 42702. Because this is a BEFORE INSERT trigger on
-- chore_completions — deliberately the single chokepoint both write paths
-- share (the complete_household_task RPC and the RLS-permitted direct
-- insert) — EVERY completion fails. Verified against a live database:
-- both recurring and non-recurring tasks error, so no task in the app can
-- be marked done.
--
-- Fix: rename the local to `v_occurrence_date`. Renaming (rather than
-- only qualifying the one comparison) removes the whole class of
-- collision, since `occurrence_overrides.occurrence_date` and
-- `chore_completions.occurrence_due_date` are both in scope in this
-- function.
--
-- Behaviour is otherwise BYTE-FOR-BYTE identical to the original: the
-- child assignment guard, the scheduled-occurrence guard, and every
-- assigned NEW.* column are unchanged. This migration is a pure bug fix
-- and intentionally does not alter the security model.
-- ============================================================

create or replace function public.prepare_chore_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare definition public.chores%rowtype; effective_assignee uuid; overridden boolean := false; v_occurrence_date date; actor_id uuid; actor_is_adult boolean;
begin
  select * into definition from public.chores where id=new.chore_id for update;
  if definition.id is null then raise exception 'Task not found'; end if;
  if definition.status <> 'active' then raise exception 'Archived task cannot be completed'; end if;
  actor_id := public.current_active_member_id();
  actor_is_adult := public.is_active_family_adult(definition.family_id);
  if actor_id is null then raise exception 'Active household membership required'; end if;
  v_occurrence_date := coalesce(new.occurrence_due_date,definition.due_date,current_date);
  effective_assignee := public.effective_task_assignee(definition.id,v_occurrence_date);
  overridden := exists(select 1 from public.occurrence_overrides o where o.series_type='task' and o.series_id=definition.id and o.occurrence_date=v_occurrence_date and not o.cancelled);
  if not actor_is_adult and (effective_assignee is null or actor_id <> effective_assignee) then
    raise exception 'A child can complete only their effective assignment';
  end if;
  if not actor_is_adult
    and v_occurrence_date is distinct from coalesce(definition.due_date, current_date)
    and not overridden then
    raise exception 'A child can complete only a scheduled occurrence';
  end if;
  new.completed_by := coalesce(effective_assignee, actor_id);
  new.occurrence_due_date := v_occurrence_date;
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

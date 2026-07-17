-- Child Accounts Batch 4: constrain which occurrence a child may complete.
--
-- Batch 1 established that a child may only complete their own effective
-- assignment, but left the occurrence date itself unvalidated. Both write
-- paths take the date from the client:
--
--   complete_household_task(p_task_id, p_occurrence_date)  -- RPC argument
--   insert into chore_completions(..., occurrence_due_date) -- RLS-permitted
--
-- effective_task_assignee() falls back to chores.assigned_to for any date with
-- no override or history row, so for a task currently assigned to child A every
-- date in history resolves to child A. A child could therefore replay their own
-- reward-enabled, auto-approved task across arbitrary occurrence dates and mint
-- unbounded allowance_ledger credit: the "already completed" check in
-- complete_household_task is per occurrence date, so each new date is a fresh
-- reward.
--
-- The guard lives in the BEFORE INSERT trigger rather than in the RPC because
-- the trigger is the one chokepoint both paths share; fixing only the RPC would
-- leave the direct insert open.
--
-- Adults are intentionally unaffected: on-behalf completion and backfill remain
-- free-form. Only the child branch is narrowed, to the occurrences a child can
-- actually see:
--   * the task's current due date (what every client screen completes today),
--     or current_date when the task has no due date;
--   * any explicitly scheduled, non-cancelled occurrence override.

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
  if not actor_is_adult
    and occurrence_date is distinct from coalesce(definition.due_date, current_date)
    and not overridden then
    raise exception 'A child can complete only a scheduled occurrence';
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

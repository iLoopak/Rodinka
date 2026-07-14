-- Reject reminder payloads that cite nonexistent or cross-family source rows.
-- The client may describe reminders for its own member, but cannot invent the
-- source identity that authorizes that reminder.

create or replace function reminder_sources_belong_to_family(
  p_family_id uuid,
  p_source text,
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with source_ids as (
    select value, case
      when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then value::uuid
    end as id
    from jsonb_array_elements_text(p_metadata->'sourceIds')
  )
  select coalesce((select count(*) between 1 and 250 and bool_and(id is not null) from source_ids), false)
    and case p_source
      when 'chore' then not exists (
        select 1 from source_ids s where not exists (select 1 from chores x where x.id = s.id and x.family_id = p_family_id)
      )
      when 'activity' then not exists (
        select 1 from source_ids s where not exists (select 1 from activities x where x.id = s.id and x.family_id = p_family_id)
      )
      when 'activity-payment' then not exists (
        select 1 from source_ids s where not exists (select 1 from activities x where x.id = s.id and x.family_id = p_family_id)
      )
      when 'medical-appointment' then not exists (
        select 1 from source_ids s where not exists (select 1 from medical_records x where x.id = s.id and x.family_id = p_family_id)
      )
      when 'vaccination' then not exists (
        select 1 from source_ids s where not exists (select 1 from medical_records x where x.id = s.id and x.family_id = p_family_id)
      )
      when 'voting' then not exists (
        select 1 from source_ids s where not exists (select 1 from meal_vote_rounds x where x.id = s.id and x.family_id = p_family_id)
      )
      when 'meal-plan' then not exists (
        select 1 from source_ids s where not exists (select 1 from meal_plan_entries x where x.id = s.id and x.family_id = p_family_id)
      )
      when 'allowance' then not exists (
        select 1 from source_ids s where not exists (
          select 1 from chore_completions x
          join chores c on c.id = x.chore_id
          where x.id = s.id and c.family_id = p_family_id
        )
      )
      when 'shopping' then not exists (
        select 1 from source_ids s where not exists (select 1 from shopping_items x where x.id = s.id and x.family_id = p_family_id)
      )
      -- There is no document source table yet, so document reminders must stay inactive.
      when 'document' then false
      else false
    end;
$$;

revoke all on function reminder_sources_belong_to_family(uuid, text, jsonb) from public;

create or replace function enforce_reminder_source_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not reminder_sources_belong_to_family(new.family_id, new.source, new.metadata) then
    raise exception 'Reminder source does not belong to this family';
  end if;
  return new;
end;
$$;

revoke all on function enforce_reminder_source_guard() from public;

drop trigger if exists reminders_source_guard on reminders;
create trigger reminders_source_guard
before insert or update of family_id, source, metadata on reminders
for each row execute function enforce_reminder_source_guard();

-- Persistent manual ordering for the quick-task inbox and shopping list.
-- New entries use sort_order=0, so they naturally appear at the top until
-- a household member explicitly reorders the list.

alter table public.chores
  add column if not exists sort_order bigint not null default 0;

alter table public.shopping_items
  add column if not exists sort_order bigint not null default 0;

with ranked as (
  select id, row_number() over (partition by family_id order by created_at desc, id) * 1024 as position
  from public.chores
)
update public.chores c set sort_order = ranked.position
from ranked where ranked.id = c.id and c.sort_order = 0;

with ranked as (
  select id, row_number() over (
    partition by family_id, purchased, category
    order by created_at desc, id
  ) * 1024 as position
  from public.shopping_items
)
update public.shopping_items i set sort_order = ranked.position
from ranked where ranked.id = i.id and i.sort_order = 0;

create index if not exists chores_family_manual_order_idx
  on public.chores (family_id, sort_order, created_at desc);

create index if not exists shopping_items_family_category_manual_order_idx
  on public.shopping_items (family_id, purchased, category, sort_order, created_at desc)
  where archived_at is null;

create or replace function public.reorder_household_tasks(
  p_family_id uuid,
  p_ordered_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.members%rowtype;
  task_id uuid;
  position bigint := 1024;
begin
  select * into actor from public.members
  where family_id = p_family_id and user_id = auth.uid() and status = 'active'
    and role in ('admin', 'parent')
  limit 1;
  if actor.id is null then raise exception 'Only an adult household member can reorder tasks'; end if;

  if coalesce(array_length(p_ordered_ids, 1), 0) <> (
    select count(distinct value) from unnest(coalesce(p_ordered_ids, array[]::uuid[])) value
  ) then raise exception 'Task order contains duplicate IDs'; end if;

  if exists (
    select 1 from unnest(coalesce(p_ordered_ids, array[]::uuid[])) value
    left join public.chores c on c.id = value and c.family_id = p_family_id
    where c.id is null
  ) then raise exception 'Task does not belong to this household'; end if;

  foreach task_id in array coalesce(p_ordered_ids, array[]::uuid[]) loop
    update public.chores set sort_order = position where id = task_id and family_id = p_family_id;
    position := position + 1024;
  end loop;
end;
$$;

create or replace function public.reorder_shopping_items(
  p_family_id uuid,
  p_moved_item_id uuid,
  p_target_category text,
  p_ordered_target_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_id uuid;
  position bigint := 1024;
begin
  if not public.is_family_member(p_family_id) then raise exception 'Not a household member'; end if;
  if p_target_category not in ('produce', 'bakery', 'meat', 'dairy', 'household', 'pharmacy', 'other') then
    raise exception 'Invalid shopping category';
  end if;
  if not exists (
    select 1 from public.shopping_items
    where id = p_moved_item_id and family_id = p_family_id and purchased = false and archived_at is null
  ) then raise exception 'Shopping item not found'; end if;
  if not p_moved_item_id = any(coalesce(p_ordered_target_ids, array[]::uuid[])) then
    raise exception 'Target order must contain the moved item';
  end if;
  if coalesce(array_length(p_ordered_target_ids, 1), 0) <> (
    select count(distinct value) from unnest(coalesce(p_ordered_target_ids, array[]::uuid[])) value
  ) then raise exception 'Shopping order contains duplicate IDs'; end if;
  if exists (
    select 1 from unnest(coalesce(p_ordered_target_ids, array[]::uuid[])) value
    left join public.shopping_items i on i.id = value and i.family_id = p_family_id and i.purchased = false and i.archived_at is null
    where i.id is null
  ) then raise exception 'Shopping item does not belong to this household'; end if;

  update public.shopping_items set category = p_target_category where id = p_moved_item_id;
  foreach item_id in array coalesce(p_ordered_target_ids, array[]::uuid[]) loop
    update public.shopping_items
      set sort_order = position
      where id = item_id and family_id = p_family_id and category = p_target_category;
    position := position + 1024;
  end loop;
end;
$$;

revoke all on function public.reorder_household_tasks(uuid, uuid[]) from public;
revoke all on function public.reorder_shopping_items(uuid, uuid, text, uuid[]) from public;
grant execute on function public.reorder_household_tasks(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_shopping_items(uuid, uuid, text, uuid[]) to authenticated;

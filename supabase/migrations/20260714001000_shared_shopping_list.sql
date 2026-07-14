-- ============================================================
-- Phase 3.5: Shared shopping list + reusable meal ingredients
-- Run after 009_chore_recurrence_lifecycle.sql
-- ============================================================

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  normalized_name text not null,
  quantity numeric(10, 3) check (quantity is null or quantity > 0),
  unit text check (unit is null or unit in ('pcs', 'pack', 'kg', 'g', 'l', 'ml', 'bottle', 'can', 'box')),
  note text check (note is null or char_length(note) <= 500),
  category text not null default 'other'
    check (category in ('produce', 'bakery', 'meat', 'dairy', 'household', 'pharmacy', 'other')),
  created_by_member_id uuid references members(id) on delete set null,
  responsible_member_id uuid references members(id) on delete set null,
  purchased boolean not null default false,
  purchased_by_member_id uuid references members(id) on delete set null,
  purchased_at timestamptz,
  archived_at timestamptz,
  source_meal_id uuid references meals(id) on delete set null,
  source_meal_plan_entry_id uuid references meal_plan_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_purchase_metadata check (
    (purchased = false and purchased_at is null and purchased_by_member_id is null)
    or (purchased = true and purchased_at is not null)
  )
);

create index shopping_items_family_active_idx
  on shopping_items (family_id, purchased, category, created_at desc)
  where archived_at is null;
create index shopping_items_family_history_idx
  on shopping_items (family_id, purchased_at desc)
  where purchased = true;
create index shopping_items_duplicate_idx
  on shopping_items (family_id, normalized_name, unit)
  where purchased = false and archived_at is null;

create table meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  quantity numeric(10, 3) check (quantity is null or quantity > 0),
  unit text check (unit is null or unit in ('pcs', 'pack', 'kg', 'g', 'l', 'ml', 'bottle', 'can', 'box')),
  note text check (note is null or char_length(note) <= 500),
  category text not null default 'other'
    check (category in ('produce', 'bakery', 'meat', 'dairy', 'household', 'pharmacy', 'other')),
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_ingredients_meal_order_idx on meal_ingredients (meal_id, sort_order, created_at);

create or replace function normalize_shopping_name(value text)
returns text as $$
  select regexp_replace(lower(btrim(coalesce(value, ''))), '\s+', ' ', 'g');
$$ language sql immutable;

create or replace function validate_shopping_item()
returns trigger as $$
begin
  new.name := btrim(new.name);
  new.normalized_name := normalize_shopping_name(new.name);
  new.note := nullif(btrim(new.note), '');
  new.unit := nullif(btrim(new.unit), '');
  new.updated_at := now();

  if new.normalized_name = '' then raise exception 'Shopping item name is required'; end if;

  if tg_op = 'UPDATE' and (new.family_id <> old.family_id or new.created_by_member_id is distinct from old.created_by_member_id) then
    raise exception 'Shopping item ownership cannot be changed';
  end if;

  if new.created_by_member_id is not null and not exists (
    select 1 from members m where m.id = new.created_by_member_id and m.family_id = new.family_id
  ) then raise exception 'Creator must belong to the shopping item family'; end if;

  if tg_op = 'INSERT' then
    if new.created_by_member_id is null or not exists (
      select 1 from members m
      where m.id = new.created_by_member_id and m.family_id = new.family_id and m.user_id = auth.uid()
    ) then raise exception 'Creator must be the current family member'; end if;
  end if;

  if new.responsible_member_id is not null and not exists (
    select 1 from members m where m.id = new.responsible_member_id and m.family_id = new.family_id
  ) then raise exception 'Responsible member must belong to the shopping item family'; end if;

  if new.purchased_by_member_id is not null and not exists (
    select 1 from members m where m.id = new.purchased_by_member_id and m.family_id = new.family_id
  ) then raise exception 'Purchasing member must belong to the shopping item family'; end if;

  if new.purchased = true then
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.purchased = false) then
      if not exists (
        select 1 from members m
        where m.id = new.purchased_by_member_id and m.family_id = new.family_id and m.user_id = auth.uid()
      ) then raise exception 'Purchasing member must be the current family member'; end if;
    end if;
  end if;

  if new.source_meal_id is not null and not exists (
    select 1 from meals m where m.id = new.source_meal_id and m.family_id = new.family_id
  ) then raise exception 'Source meal must belong to the shopping item family'; end if;

  if new.source_meal_plan_entry_id is not null and not exists (
    select 1 from meal_plan_entries e where e.id = new.source_meal_plan_entry_id and e.family_id = new.family_id
  ) then raise exception 'Source plan entry must belong to the shopping item family'; end if;

  return new;
end;
$$ language plpgsql;

create trigger shopping_items_validate
before insert or update on shopping_items
for each row execute function validate_shopping_item();

alter table shopping_items enable row level security;
alter table meal_ingredients enable row level security;

create policy "family members read shopping items" on shopping_items for select
  using (is_family_member(family_id));
create policy "family members create shopping items" on shopping_items for insert
  with check (is_family_member(family_id));
create policy "family members update shopping items" on shopping_items for update
  using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy "family members delete shopping items" on shopping_items for delete
  using (is_family_member(family_id));

create policy "family members read meal ingredients" on meal_ingredients for select
  using (exists (select 1 from meals m where m.id = meal_id and is_family_member(m.family_id)));
create policy "parents create meal ingredients" on meal_ingredients for insert
  with check (exists (select 1 from meals m where m.id = meal_id and is_family_parent(m.family_id)));
create policy "parents update meal ingredients" on meal_ingredients for update
  using (exists (select 1 from meals m where m.id = meal_id and is_family_parent(m.family_id)))
  with check (exists (select 1 from meals m where m.id = meal_id and is_family_parent(m.family_id)));
create policy "parents delete meal ingredients" on meal_ingredients for delete
  using (exists (select 1 from meals m where m.id = meal_id and is_family_parent(m.family_id)));

create or replace function add_shopping_item(
  p_family_id uuid,
  p_name text,
  p_quantity numeric default null,
  p_unit text default null,
  p_note text default null,
  p_category text default 'other',
  p_responsible_member_id uuid default null,
  p_source_meal_id uuid default null,
  p_source_meal_plan_entry_id uuid default null,
  p_force_separate boolean default false
) returns jsonb as $$
declare
  actor_id uuid;
  existing shopping_items%rowtype;
  inserted shopping_items%rowtype;
  normalized text := normalize_shopping_name(p_name);
  clean_unit text := nullif(btrim(p_unit), '');
  clean_note text := nullif(btrim(p_note), '');
begin
  select id into actor_id from members
  where family_id = p_family_id and user_id = auth.uid();
  if actor_id is null then raise exception 'Not authorized for this family'; end if;
  if normalized = '' then raise exception 'Shopping item name is required'; end if;
  if p_quantity is not null and p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;

  if p_responsible_member_id is not null and not exists (
    select 1 from members where id = p_responsible_member_id and family_id = p_family_id
  ) then raise exception 'Responsible member must belong to this family'; end if;

  if not p_force_separate then
    select * into existing from shopping_items
    where family_id = p_family_id
      and normalized_name = normalized
      and purchased = false
      and archived_at is null
      and coalesce(unit, '') = coalesce(clean_unit, '')
      and coalesce(note, '') = coalesce(clean_note, '')
    order by created_at
    limit 1
    for update;

    if existing.id is not null then
      if existing.quantity is not null and p_quantity is not null then
        update shopping_items set quantity = existing.quantity + p_quantity, updated_at = now()
        where id = existing.id returning * into existing;
        return jsonb_build_object('action', 'merged', 'item', to_jsonb(existing));
      elsif existing.quantity is null and p_quantity is null then
        return jsonb_build_object('action', 'existing', 'item', to_jsonb(existing));
      end if;
    end if;
  end if;

  insert into shopping_items (
    family_id, name, normalized_name, quantity, unit, note, category,
    created_by_member_id, responsible_member_id, source_meal_id, source_meal_plan_entry_id
  ) values (
    p_family_id, btrim(p_name), normalized, p_quantity, clean_unit, clean_note, p_category,
    actor_id, p_responsible_member_id, p_source_meal_id, p_source_meal_plan_entry_id
  ) returning * into inserted;

  return jsonb_build_object('action', 'added', 'item', to_jsonb(inserted));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function set_shopping_item_purchased(p_item_id uuid, p_purchased boolean)
returns shopping_items as $$
declare
  item shopping_items%rowtype;
  actor_id uuid;
begin
  select * into item from shopping_items where id = p_item_id for update;
  if item.id is null then raise exception 'Shopping item not found'; end if;
  select id into actor_id from members where family_id = item.family_id and user_id = auth.uid();
  if actor_id is null then raise exception 'Not authorized for this family'; end if;

  update shopping_items set
    purchased = p_purchased,
    purchased_by_member_id = case when p_purchased then actor_id else null end,
    purchased_at = case when p_purchased then now() else null end,
    archived_at = case when p_purchased then archived_at else null end,
    updated_at = now()
  where id = p_item_id returning * into item;
  return item;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function archive_purchased_shopping_items(p_family_id uuid)
returns integer as $$
declare affected integer;
begin
  if not is_family_member(p_family_id) then raise exception 'Not authorized for this family'; end if;
  update shopping_items set archived_at = now(), updated_at = now()
  where family_id = p_family_id and purchased = true and archived_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function import_shopping_items(
  p_family_id uuid,
  p_items jsonb,
  p_source_meal_id uuid default null,
  p_source_meal_plan_entry_id uuid default null
) returns jsonb as $$
declare
  value jsonb;
  result jsonb;
  action text;
  added_count integer := 0;
  merged_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Items must be an array'; end if;
  for value in select * from jsonb_array_elements(p_items)
  loop
    begin
      result := add_shopping_item(
        p_family_id,
        value->>'name',
        nullif(value->>'quantity', '')::numeric,
        value->>'unit',
        value->>'note',
        coalesce(value->>'category', 'other'),
        nullif(value->>'responsibleMemberId', '')::uuid,
        p_source_meal_id,
        p_source_meal_plan_entry_id,
        false
      );
      action := result->>'action';
      if action = 'added' then added_count := added_count + 1;
      elsif action = 'merged' then merged_count := merged_count + 1;
      else skipped_count := skipped_count + 1;
      end if;
    exception when others then
      failed_count := failed_count + 1;
    end;
  end loop;
  return jsonb_build_object('added', added_count, 'merged', merged_count, 'skipped', skipped_count, 'failed', failed_count);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function replace_meal_ingredients(p_meal_id uuid, p_ingredients jsonb)
returns void as $$
declare
  family uuid;
  value jsonb;
  position integer := 0;
begin
  select family_id into family from meals where id = p_meal_id;
  if family is null then raise exception 'Meal not found'; end if;
  if not is_family_parent(family) then raise exception 'Not authorized to edit this meal'; end if;
  if jsonb_typeof(p_ingredients) <> 'array' then raise exception 'Ingredients must be an array'; end if;

  for value in select * from jsonb_array_elements(p_ingredients)
  loop
    if normalize_shopping_name(value->>'name') = '' then raise exception 'Ingredient name is required'; end if;
    if nullif(value->>'quantity', '')::numeric <= 0 then raise exception 'Ingredient quantity must be positive'; end if;
  end loop;

  delete from meal_ingredients where meal_id = p_meal_id;
  for value in select * from jsonb_array_elements(p_ingredients)
  loop
    insert into meal_ingredients (meal_id, name, quantity, unit, note, category, sort_order)
    values (
      p_meal_id,
      btrim(value->>'name'),
      nullif(value->>'quantity', '')::numeric,
      nullif(btrim(value->>'unit'), ''),
      nullif(btrim(value->>'note'), ''),
      coalesce(value->>'category', 'other'),
      position
    );
    position := position + 1;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function add_shopping_item(uuid, text, numeric, text, text, text, uuid, uuid, uuid, boolean) from public;
revoke execute on function set_shopping_item_purchased(uuid, boolean) from public;
revoke execute on function archive_purchased_shopping_items(uuid) from public;
revoke execute on function import_shopping_items(uuid, jsonb, uuid, uuid) from public;
revoke execute on function replace_meal_ingredients(uuid, jsonb) from public;

grant execute on function add_shopping_item(uuid, text, numeric, text, text, text, uuid, uuid, uuid, boolean) to authenticated;
grant execute on function set_shopping_item_purchased(uuid, boolean) to authenticated;
grant execute on function archive_purchased_shopping_items(uuid) to authenticated;
grant execute on function import_shopping_items(uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function replace_meal_ingredients(uuid, jsonb) to authenticated;

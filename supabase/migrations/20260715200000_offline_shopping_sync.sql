-- Durable, idempotent server boundary for offline shopping mutations.
create table if not exists public.shopping_sync_mutations (
  mutation_id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  item_id uuid not null,
  mutation_type text not null check (mutation_type in ('create', 'update', 'delete', 'toggle', 'reorder')),
  result jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now()
);

create index if not exists shopping_sync_mutations_family_applied_idx
  on public.shopping_sync_mutations (family_id, applied_at desc);

alter table public.shopping_sync_mutations enable row level security;
revoke all on table public.shopping_sync_mutations from public, anon, authenticated;
grant all on table public.shopping_sync_mutations to service_role;

create or replace function public.apply_shopping_mutation(
  p_mutation_id uuid,
  p_family_id uuid,
  p_mutation_type text,
  p_item_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  existing public.shopping_items%rowtype;
  changed public.shopping_items%rowtype;
  stored_result jsonb;
  normalized text;
  clean_unit text;
  clean_note text;
  item_id uuid;
  position bigint := 1024;
begin
  if p_mutation_type not in ('create', 'update', 'delete', 'toggle', 'reorder') then
    raise exception 'Unsupported shopping mutation';
  end if;

  select id into actor_id from public.members
  where family_id = p_family_id and user_id = auth.uid() and status = 'active'
  limit 1;
  if actor_id is null then raise exception 'Not authorized for this family'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_mutation_id::text, 0));
  select result into stored_result from public.shopping_sync_mutations
  where mutation_id = p_mutation_id and family_id = p_family_id;
  if found then return stored_result; end if;

  if p_mutation_type = 'create' then
    if (p_payload->'item'->>'id')::uuid <> p_item_id
      or (p_payload->'item'->>'family_id')::uuid <> p_family_id then
      raise exception 'Invalid offline shopping item identity';
    end if;

    select * into existing from public.shopping_items where id = p_item_id;
    if existing.id is not null then
      stored_result := jsonb_build_object('action', 'existing', 'item', to_jsonb(existing));
    else
      normalized := public.normalize_shopping_name(p_payload->'item'->>'name');
      clean_unit := nullif(btrim(p_payload->'item'->>'unit'), '');
      clean_note := nullif(btrim(p_payload->'item'->>'note'), '');
      if normalized = '' then raise exception 'Shopping item name is required'; end if;

      select * into existing from public.shopping_items
      where family_id = p_family_id
        and normalized_name = normalized
        and purchased = false
        and archived_at is null
        and coalesce(unit, '') = coalesce(clean_unit, '')
        and coalesce(note, '') = coalesce(clean_note, '')
      order by created_at
      limit 1
      for update;

      if existing.id is not null
        and existing.quantity is not null
        and nullif(p_payload->'item'->>'quantity', '')::numeric is not null then
        update public.shopping_items
        set quantity = existing.quantity + (p_payload->'item'->>'quantity')::numeric
        where id = existing.id returning * into changed;
        stored_result := jsonb_build_object('action', 'merged', 'item', to_jsonb(changed));
      elsif existing.id is not null
        and existing.quantity is null
        and nullif(p_payload->'item'->>'quantity', '')::numeric is null then
        stored_result := jsonb_build_object('action', 'existing', 'item', to_jsonb(existing));
      else
        insert into public.shopping_items (
          id, family_id, name, normalized_name, quantity, unit, note, category,
          created_by_member_id, responsible_member_id, purchased,
          purchased_by_member_id, purchased_at, archived_at, sort_order,
          source_meal_id, source_meal_plan_entry_id, created_at, updated_at
        ) values (
          p_item_id,
          p_family_id,
          btrim(p_payload->'item'->>'name'),
          normalized,
          nullif(p_payload->'item'->>'quantity', '')::numeric,
          clean_unit,
          clean_note,
          coalesce(p_payload->'item'->>'category', 'other'),
          actor_id,
          nullif(p_payload->'item'->>'responsible_member_id', '')::uuid,
          coalesce((p_payload->'item'->>'purchased')::boolean, false),
          case when coalesce((p_payload->'item'->>'purchased')::boolean, false) then actor_id else null end,
          case when coalesce((p_payload->'item'->>'purchased')::boolean, false) then now() else null end,
          nullif(p_payload->'item'->>'archived_at', '')::timestamptz,
          coalesce((p_payload->'item'->>'sort_order')::bigint, 0),
          nullif(p_payload->'item'->>'source_meal_id', '')::uuid,
          nullif(p_payload->'item'->>'source_meal_plan_entry_id', '')::uuid,
          coalesce(nullif(p_payload->'item'->>'created_at', '')::timestamptz, now()),
          now()
        ) returning * into changed;
        stored_result := jsonb_build_object('action', 'added', 'item', to_jsonb(changed));
      end if;
    end if;

  elsif p_mutation_type = 'update' then
    update public.shopping_items set
      name = case when p_payload ? 'name' then p_payload->>'name' else name end,
      quantity = case when p_payload ? 'quantity' then nullif(p_payload->>'quantity', '')::numeric else quantity end,
      unit = case when p_payload ? 'unit' then nullif(p_payload->>'unit', '') else unit end,
      note = case when p_payload ? 'note' then nullif(p_payload->>'note', '') else note end,
      category = case when p_payload ? 'category' then p_payload->>'category' else category end,
      responsible_member_id = case when p_payload ? 'responsible_member_id' then nullif(p_payload->>'responsible_member_id', '')::uuid else responsible_member_id end,
      archived_at = case when p_payload ? 'archived_at' then nullif(p_payload->>'archived_at', '')::timestamptz else archived_at end
    where id = p_item_id and family_id = p_family_id returning * into changed;
    stored_result := jsonb_build_object('action', case when changed.id is null then 'missing' else 'updated' end, 'item', to_jsonb(changed));

  elsif p_mutation_type = 'delete' then
    delete from public.shopping_items where id = p_item_id and family_id = p_family_id returning * into changed;
    stored_result := jsonb_build_object('action', 'deleted', 'itemId', p_item_id);

  elsif p_mutation_type = 'toggle' then
    update public.shopping_items set
      purchased = coalesce((p_payload->>'purchased')::boolean, false),
      purchased_by_member_id = case when coalesce((p_payload->>'purchased')::boolean, false) then actor_id else null end,
      purchased_at = case when coalesce((p_payload->>'purchased')::boolean, false) then now() else null end,
      archived_at = case when coalesce((p_payload->>'purchased')::boolean, false) then archived_at else null end
    where id = p_item_id and family_id = p_family_id returning * into changed;
    stored_result := jsonb_build_object('action', case when changed.id is null then 'missing' else 'toggled' end, 'item', to_jsonb(changed));

  else
    if p_payload->>'targetCategory' not in ('produce', 'bakery', 'meat', 'dairy', 'household', 'pharmacy', 'other') then
      raise exception 'Invalid shopping category';
    end if;
    update public.shopping_items set category = p_payload->>'targetCategory'
    where id = p_item_id and family_id = p_family_id;
    for item_id in select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'orderedTargetIds', '[]'::jsonb)) value loop
      update public.shopping_items set sort_order = position
      where id = item_id and family_id = p_family_id and category = p_payload->>'targetCategory';
      position := position + 1024;
    end loop;
    stored_result := jsonb_build_object('action', 'reordered', 'itemId', p_item_id);
  end if;

  insert into public.shopping_sync_mutations (mutation_id, family_id, item_id, mutation_type, result)
  values (p_mutation_id, p_family_id, p_item_id, p_mutation_type, coalesce(stored_result, '{}'::jsonb));
  return stored_result;
end;
$$;

revoke all on function public.apply_shopping_mutation(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.apply_shopping_mutation(uuid, uuid, text, uuid, jsonb) to authenticated;

alter table public.shopping_items replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items'
    ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end $$;

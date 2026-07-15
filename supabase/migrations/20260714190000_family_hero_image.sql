-- Optional private family photo used by the authenticated Today hero.
alter table public.families
  add column if not exists hero_image_path text;

create or replace function public.is_family_hero_image_path(object_name text, target_family_id uuid)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    cardinality(string_to_array(object_name, '/')) = 2
    and split_part(object_name, '/', 1) = target_family_id::text
    and split_part(object_name, '/', 2) ~* '^[0-9a-f-]+\.(jpe?g|webp)$';
$$;

create or replace function public.can_read_family_hero_image(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.families f
    where public.is_family_hero_image_path(object_name, f.id)
      and public.is_family_member(f.id)
  );
$$;

create or replace function public.can_manage_family_hero_image(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.families f
    join public.members actor on actor.family_id = f.id
    where public.is_family_hero_image_path(object_name, f.id)
      and actor.user_id = auth.uid()
      and actor.role = 'admin'
      and coalesce(actor.status, 'active') = 'active'
  );
$$;

revoke execute on function public.is_family_hero_image_path(text, uuid) from public;
revoke execute on function public.can_read_family_hero_image(text) from public;
revoke execute on function public.can_manage_family_hero_image(text) from public;
grant execute on function public.is_family_hero_image_path(text, uuid) to authenticated;
grant execute on function public.can_read_family_hero_image(text) to authenticated;
grant execute on function public.can_manage_family_hero_image(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-hero-images',
  'family-hero-images',
  false,
  5242880,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "family members can read family hero images" on storage.objects;
create policy "family members can read family hero images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'family-hero-images'
    and public.can_read_family_hero_image(name)
  );

drop policy if exists "family admins can upload family hero images" on storage.objects;
create policy "family admins can upload family hero images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'family-hero-images'
    and public.can_manage_family_hero_image(name)
  );

drop policy if exists "family admins can delete family hero images" on storage.objects;
create policy "family admins can delete family hero images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'family-hero-images'
    and public.can_manage_family_hero_image(name)
  );

-- Optional, explicitly preferred Czech form of address for a member.
-- Existing rows stay null and use automatic presentation-time conversion.
alter table members
  add column if not exists vocative_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'members_vocative_name_length'
      and conrelid = 'members'::regclass
  ) then
    alter table members
      add constraint members_vocative_name_length
      check (vocative_name is null or char_length(vocative_name) <= 120);
  end if;
end;
$$;

-- Keep the existing six-argument overload during rolling deployments. Older
-- clients can still edit profiles; the new seven-argument overload is selected
-- only when p_vocative_name is present and leaves existing rows compatible.
create or replace function update_member_profile(
  p_target_member_id uuid,
  p_display_name text,
  p_birth_date date,
  p_color_key text,
  p_avatar_path text,
  p_grammatical_gender text,
  p_vocative_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target members%rowtype;
  v_access text;
  v_vocative_name text := nullif(regexp_replace(btrim(coalesce(p_vocative_name, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_target
  from members
  where id = p_target_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  v_access := member_profile_access(v_target.id);
  if v_access = 'none' then
    raise exception 'Not authorized to update this profile';
  end if;

  if p_color_key is not null
    and p_color_key not in ('brick', 'coral', 'sky', 'sage', 'honey', 'lavender', 'berry') then
    raise exception 'Unsupported member color';
  end if;

  if p_grammatical_gender is not null
    and p_grammatical_gender not in ('masculine', 'feminine', 'neutral') then
    raise exception 'Unsupported grammatical gender';
  end if;

  if p_avatar_path is not null
    and not is_member_avatar_path(p_avatar_path, v_target.family_id, v_target.id) then
    raise exception 'Invalid avatar path';
  end if;

  if v_access = 'limited' then
    if p_display_name is distinct from v_target.display_name
      or p_birth_date is distinct from v_target.birth_date then
      raise exception 'A child account cannot change name or birth date';
    end if;

    update members
    set color_key = p_color_key,
        avatar_path = p_avatar_path,
        grammatical_gender = p_grammatical_gender,
        vocative_name = v_vocative_name,
        updated_at = now()
    where id = v_target.id;
    return;
  end if;

  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'Display name is required';
  end if;

  update members
  set display_name = btrim(p_display_name),
      birth_date = p_birth_date,
      color_key = p_color_key,
      avatar_path = p_avatar_path,
      grammatical_gender = p_grammatical_gender,
      vocative_name = v_vocative_name,
      updated_at = now()
  where id = v_target.id;
end;
$$;

revoke execute on function update_member_profile(uuid, text, date, text, text, text, text) from public;
grant execute on function update_member_profile(uuid, text, date, text, text, text, text) to authenticated;

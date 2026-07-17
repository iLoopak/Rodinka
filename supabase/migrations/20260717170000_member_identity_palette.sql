-- Rodinka — canonical eight-color member identity palette.
-- Existing legacy values remain readable in clients; this migration permits
-- profile saves to persist only the new semantic keys going forward.

alter table members
  drop constraint if exists members_color_key_check;

alter table members
  add constraint members_color_key_check
    check (color_key is null or color_key in ('coral', 'honey', 'mint', 'blue', 'lavender', 'berry', 'peach', 'sage', 'brick', 'sky'));

create or replace function normalize_member_color_key(p_color_key text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(trim(p_color_key))
    when 'coral' then 'coral'
    when 'honey' then 'honey'
    when 'mint' then 'mint'
    when 'blue' then 'blue'
    when 'lavender' then 'lavender'
    when 'berry' then 'berry'
    when 'peach' then 'peach'
    when 'sage' then 'sage'
    when 'brick' then 'lavender'
    when 'sky' then 'blue'
    else null
  end;
$$;

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
  v_color_key text;
begin
  select * into v_target from members where id = p_target_member_id;
  if not found then raise exception 'Member not found'; end if;

  v_access := member_profile_access(v_target.id);
  if v_access = 'none' then raise exception 'Not authorized to update this profile'; end if;

  v_color_key := normalize_member_color_key(p_color_key);
  if p_color_key is not null and v_color_key is null then
    raise exception 'Unsupported member color';
  end if;

  if p_avatar_path is not null
    and not is_member_avatar_path(p_avatar_path, v_target.family_id, v_target.id) then
    raise exception 'Invalid avatar path';
  end if;

  if v_access = 'full' then
    update members set
      display_name = nullif(trim(p_display_name), ''),
      birth_date = p_birth_date,
      color_key = v_color_key,
      avatar_path = p_avatar_path,
      grammatical_gender = p_grammatical_gender,
      vocative_name = nullif(trim(p_vocative_name), ''),
      updated_at = now()
    where id = v_target.id;
  else
    update members set
      color_key = v_color_key,
      avatar_path = p_avatar_path,
      grammatical_gender = p_grammatical_gender,
      vocative_name = nullif(trim(p_vocative_name), ''),
      updated_at = now()
    where id = v_target.id;
  end if;
end;
$$;

grant execute on function normalize_member_color_key(text) to authenticated;
revoke execute on function update_member_profile(uuid, text, date, text, text, text, text) from public;
grant execute on function update_member_profile(uuid, text, date, text, text, text, text) to authenticated;

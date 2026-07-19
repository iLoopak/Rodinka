-- Rodinka — custom member colors while keeping the canonical palette.

alter table members
  add column if not exists custom_color text;

alter table members
  drop constraint if exists members_custom_color_check;

alter table members
  add constraint members_custom_color_check
    check (custom_color is null or custom_color ~ '^#[0-9A-F]{6}$');

create or replace function normalize_member_custom_color(p_custom_color text)
returns text
language sql
immutable
as $$
  select case
    when p_custom_color is null or trim(p_custom_color) = '' then null
    when trim(p_custom_color) ~ '^#?[0-9A-Fa-f]{6}$' then '#' || upper(regexp_replace(trim(p_custom_color), '^#', ''))
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
  p_vocative_name text,
  p_custom_color text
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
  v_custom_color text;
begin
  select * into v_target from members where id = p_target_member_id;
  if not found then raise exception 'Member not found'; end if;

  v_access := member_profile_access(v_target.id);
  if v_access = 'none' then raise exception 'Not authorized to update this profile'; end if;

  v_custom_color := normalize_member_custom_color(p_custom_color);
  if p_custom_color is not null and trim(p_custom_color) <> '' and v_custom_color is null then
    raise exception 'Unsupported custom member color';
  end if;

  v_color_key := case when v_custom_color is null then normalize_member_color_key(p_color_key) else null end;
  if v_custom_color is null and p_color_key is not null and v_color_key is null then
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
      custom_color = v_custom_color,
      avatar_path = p_avatar_path,
      grammatical_gender = p_grammatical_gender,
      vocative_name = nullif(trim(p_vocative_name), ''),
      updated_at = now()
    where id = v_target.id;
  else
    update members set
      color_key = v_color_key,
      custom_color = v_custom_color,
      avatar_path = p_avatar_path,
      grammatical_gender = p_grammatical_gender,
      vocative_name = nullif(trim(p_vocative_name), ''),
      updated_at = now()
    where id = v_target.id;
  end if;
end;
$$;

grant execute on function normalize_member_custom_color(text) to authenticated;
grant execute on function update_member_profile(uuid, text, date, text, text, text, text, text) to authenticated;

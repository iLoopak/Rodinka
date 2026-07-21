-- Allow the shared family_game_scores table and guarded RPC to store Family Fleet records.
-- The table, family leaderboard index, RLS policy, and database-side max/upsert
-- are created by the Family Jump migration; this migration safely extends the
-- accepted game keys without changing existing Family Jump data.

create or replace function public.record_family_game_score(
  p_family_id uuid,
  p_member_id uuid,
  p_game_key text,
  p_score integer
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
  saved_score integer;
begin
  if p_game_key not in ('family_jump', 'family_fleet') then
    raise exception 'Unsupported family game';
  end if;
  if p_score is null or p_score < 0 then
    raise exception 'Game score must be non-negative';
  end if;

  select id into actor_id
  from public.members
  where family_id = p_family_id
    and user_id = auth.uid()
    and coalesce(status, 'active') = 'active'
  limit 1;
  if actor_id is null then
    raise exception 'Not authorized for this family';
  end if;

  if not exists (
    select 1 from public.members
    where id = p_member_id
      and family_id = p_family_id
      and coalesce(status, 'active') = 'active'
  ) then
    raise exception 'Player must be an active member of this family';
  end if;

  insert into public.family_game_scores (family_id, member_id, game_key, best_score)
  values (p_family_id, p_member_id, p_game_key, p_score)
  on conflict (family_id, member_id, game_key) do update
    set best_score = excluded.best_score,
        updated_at = now()
    where excluded.best_score > public.family_game_scores.best_score;

  select best_score into saved_score
  from public.family_game_scores
  where family_id = p_family_id
    and member_id = p_member_id
    and game_key = p_game_key;

  return saved_score;
end;
$$;

revoke all on function public.record_family_game_score(uuid, uuid, text, integer) from public, anon;
grant execute on function public.record_family_game_score(uuid, uuid, text, integer) to authenticated;

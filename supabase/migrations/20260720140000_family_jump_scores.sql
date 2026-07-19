-- Shared, family-scoped best scores for Rodinka minigames.
-- The client remains offline-first; all writes cross the guarded RPC below.

create table if not exists public.family_game_scores (
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  game_key text not null,
  best_score integer not null check (best_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (family_id, member_id, game_key)
);

create index if not exists family_game_scores_family_game_rank_idx
  on public.family_game_scores (family_id, game_key, best_score desc);

alter table public.family_game_scores enable row level security;

revoke all on table public.family_game_scores from public, anon, authenticated;
grant select on table public.family_game_scores to authenticated;

drop policy if exists "family members read game scores" on public.family_game_scores;
create policy "family members read game scores"
  on public.family_game_scores for select to authenticated
  using (public.is_family_member(family_id));

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
  if p_game_key <> 'family_jump' then
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

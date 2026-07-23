-- ============================================================
-- Security hardening: pin search_path on the meal vote-round RPCs.
--
-- `open_vote_round` and `close_vote_round` were the only remaining
-- SECURITY DEFINER functions defined without a fixed `search_path`. Every
-- other definer function in the schema was standardized to
-- `set search_path = public, pg_temp` in
-- 20260717230000_child_accounts_batch1_security.sql.
--
-- Without a pinned search_path, a definer function resolves unqualified
-- names (tables like `meal_vote_rounds`, helpers like `is_family_parent`,
-- and built-ins) against the *caller's* search_path. An authenticated
-- caller could create a shadowing object in a schema that sorts ahead of
-- `public` and have it executed with the definer's elevated privileges —
-- bypassing the `is_family_parent` authorization check. Pinning the
-- search_path and schema-qualifying every reference closes that vector.
-- ============================================================

create or replace function public.open_vote_round(round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family_id uuid;
  v_status text;
  v_candidate_count int;
begin
  select family_id, status into v_family_id, v_status
  from public.meal_vote_rounds
  where id = round_id
  for update;

  if v_family_id is null then
    raise exception 'Round not found';
  end if;

  if not public.is_family_parent(v_family_id) then
    raise exception 'Not authorized to open this round';
  end if;

  if v_status <> 'draft' then
    raise exception 'Round is not in draft status';
  end if;

  if exists (
    select 1 from public.meal_vote_rounds
    where family_id = v_family_id and status = 'open' and id <> round_id
  ) then
    raise exception 'Another round is already open';
  end if;

  select count(*) into v_candidate_count
  from public.meal_vote_candidates
  where meal_vote_candidates.round_id = open_vote_round.round_id;

  if v_candidate_count = 0 then
    raise exception 'Round has no candidates';
  end if;

  update public.meal_vote_rounds set status = 'open' where id = round_id;
end;
$$;

create or replace function public.close_vote_round(round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family_id uuid;
  v_status text;
begin
  select family_id, status into v_family_id, v_status
  from public.meal_vote_rounds
  where id = round_id
  for update;

  if v_family_id is null then
    raise exception 'Round not found';
  end if;

  if not public.is_family_parent(v_family_id) then
    raise exception 'Not authorized to close this round';
  end if;

  if v_status <> 'open' then
    raise exception 'Round is not open';
  end if;

  update public.meal_vote_rounds set status = 'closed', closed_at = now() where id = round_id;
end;
$$;

revoke all on function public.open_vote_round(uuid) from public, anon;
revoke all on function public.close_vote_round(uuid) from public, anon;
grant execute on function public.open_vote_round(uuid) to authenticated;
grant execute on function public.close_vote_round(uuid) to authenticated;

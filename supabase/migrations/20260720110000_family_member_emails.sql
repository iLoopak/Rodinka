-- Expose adult account emails to other adults of the same family.
--
-- Account emails live only in auth.users, which authenticated clients cannot
-- read directly (they can see their own row at most). This security-definer
-- function lets an active adult read the registered email of the other adults
-- in their own household, and nothing else:
--
--   * The caller must be an active adult of p_family_id (is_active_family_adult),
--     otherwise the function returns no rows — children and outsiders get an
--     empty result, never an error that would hint at existence.
--   * Only active adult members (admin/parent) are returned. Children are
--     excluded entirely, so their synthetic managed-account identifiers
--     (child.<login>@children.rodinka.invalid) can never surface as an "email".
--   * Members without a linked auth user are dropped by the inner join, so an
--     adult who has not connected an account simply does not appear and the UI
--     renders its "no account connected" placeholder instead.
--
-- This is not exposed to anon/public, so no public endpoint can reach it.

create or replace function public.family_member_emails(p_family_id uuid)
returns table (member_id uuid, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, u.email::text
  from public.members m
  join auth.users u on u.id = m.user_id
  where m.family_id = p_family_id
    and coalesce(m.status, 'active') = 'active'
    and m.role in ('admin', 'parent')
    and public.is_active_family_adult(p_family_id);
$$;

revoke all on function public.family_member_emails(uuid) from public, anon;
grant execute on function public.family_member_emails(uuid) to authenticated;

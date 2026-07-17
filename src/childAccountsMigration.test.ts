import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260717230000_child_accounts_batch1_security.sql', import.meta.url),
  'utf8',
)

describe('child account authorization migration', () => {
  it('keeps the member row canonical and stores no credentials', () => {
    expect(migration).toContain('member_id uuid primary key references public.members(id)')
    expect(migration).toContain('auth_user_id uuid unique')
    expect(migration).not.toMatch(/password\s+(text|varchar)/i)
  })

  it('defines one active-member and active-adult authorization vocabulary', () => {
    expect(migration).toContain('function public.current_active_member_id()')
    expect(migration).toContain('function public.is_active_family_member(p_family_id uuid)')
    expect(migration).toContain('function public.is_active_family_adult(p_family_id uuid)')
    expect(migration).toContain('function public.can_current_actor_act_for_member(p_member_id uuid)')
    expect(migration).toContain("coalesce(m.status, 'active') = 'active'")
  })

  it('makes lifecycle primitives service-role only', () => {
    expect(migration).toContain("if auth.role() <> 'service_role' then raise exception 'Service role required'")
    expect(migration).toContain('revoke all on function public.begin_child_account_provision(uuid,uuid,text,text) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.detach_child_account_access(uuid,uuid) to service_role')
  })

  it('guards the critical child mutation boundaries', () => {
    expect(migration).toContain('A child can complete only their effective assignment')
    expect(migration).toContain("actor.role='child' and p_mutation_type not in ('create','toggle')")
    expect(migration).toContain('public.is_current_child(meal_votes.member_id)')
    expect(migration).toContain("if not public.is_active_family_adult(fid) then raise exception 'Active adult membership required'")
  })

  it('revokes implicit function execution and restores a narrow API surface', () => {
    expect(migration).toContain('revoke execute on all functions in schema public from public, anon')
    expect(migration).toContain('grant execute on function public.create_invite(uuid) to authenticated')
    expect(migration).not.toContain('grant execute on function public.begin_child_account_provision(uuid,uuid,text,text) to authenticated')
  })
})

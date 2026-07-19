import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../supabase/migrations/20260720140000_family_jump_scores.sql', import.meta.url),
  'utf8',
).toLowerCase()

describe('Family Jump shared scores migration', () => {
  it('stores one best score per family, member and game', () => {
    expect(sql).toContain('create table if not exists public.family_game_scores')
    expect(sql).toContain('primary key (family_id, member_id, game_key)')
    expect(sql).toContain('best_score integer not null check (best_score >= 0)')
    expect(sql).toContain('family_game_scores_family_game_rank_idx')
  })

  it('allows family reads but routes every write through one guarded RPC', () => {
    expect(sql).toContain('alter table public.family_game_scores enable row level security')
    expect(sql).toContain('grant select on table public.family_game_scores to authenticated')
    expect(sql).toContain('using (public.is_family_member(family_id))')
    expect(sql).not.toMatch(/family_game_scores for (insert|update|delete)/)
    expect(sql).toContain('create or replace function public.record_family_game_score')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('validates active same-family identities and never lowers a record', () => {
    expect(sql).toContain("coalesce(status, 'active') = 'active'")
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).toContain('player must be an active member of this family')
    expect(sql).toContain("p_game_key <> 'family_jump'")
    expect(sql).toContain('where excluded.best_score > public.family_game_scores.best_score')
  })

  it('exposes the write function only to authenticated clients', () => {
    expect(sql).toContain('revoke all on function public.record_family_game_score(uuid, uuid, text, integer) from public, anon')
    expect(sql).toContain('grant execute on function public.record_family_game_score(uuid, uuid, text, integer) to authenticated')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const raw = readFileSync(
  new URL('../supabase/migrations/20260723100000_vote_round_search_path_hardening.sql', import.meta.url),
  'utf8',
).toLowerCase()

// Ignore comment lines so assertions reflect executable SQL only.
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('Vote round search_path hardening migration', () => {
  it('recreates both vote-round RPCs as definer functions with a pinned search_path', () => {
    for (const fn of ['open_vote_round', 'close_vote_round']) {
      expect(sql).toContain(`create or replace function public.${fn}(round_id uuid)`)
    }
    expect(sql.match(/security definer/g) ?? []).toHaveLength(2)
    expect(sql.match(/set search_path = public, pg_temp/g) ?? []).toHaveLength(2)
  })

  it('schema-qualifies every table and helper reference the functions rely on', () => {
    expect(sql).toContain('from public.meal_vote_rounds')
    expect(sql).toContain('from public.meal_vote_candidates')
    expect(sql).toContain('public.is_family_parent(v_family_id)')
    expect(sql).not.toMatch(/from meal_vote_rounds/)
    expect(sql).not.toMatch(/not is_family_parent/)
  })

  it('keeps execution scoped to authenticated clients only', () => {
    expect(sql).toContain('revoke all on function public.open_vote_round(uuid) from public, anon')
    expect(sql).toContain('revoke all on function public.close_vote_round(uuid) from public, anon')
    expect(sql).toContain('grant execute on function public.open_vote_round(uuid) to authenticated')
    expect(sql).toContain('grant execute on function public.close_vote_round(uuid) to authenticated')
  })
})

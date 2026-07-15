import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260715200000_offline_shopping_sync.sql', import.meta.url), 'utf8')

describe('offline shopping migration', () => {
  it('provides an idempotent client-id mutation endpoint', () => {
    expect(sql).toContain('create table if not exists public.shopping_sync_mutations')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('create or replace function public.apply_shopping_mutation')
    expect(sql).toContain('p_item_id uuid')
  })

  it('publishes complete shopping item changes through realtime', () => {
    expect(sql).toContain('replica identity full')
    expect(sql).toContain('alter publication supabase_realtime add table public.shopping_items')
  })
})

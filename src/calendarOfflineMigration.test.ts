import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260720120000_offline_calendar_sync.sql', import.meta.url), 'utf8').toLowerCase()

describe('offline calendar migration', () => {
  it('guards queued creates with account authorization and durable idempotency keys', () => {
    expect(sql).toContain('create table if not exists public.calendar_sync_operations')
    expect(sql).toContain('operation_id uuid primary key')
    expect(sql).toContain('unique (family_id, record_type, local_id)')
    expect(sql).toContain('create or replace function public.apply_calendar_mutation')
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).toContain("role in ('admin', 'parent')")
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('on conflict (id) do nothing')
    expect(sql).toContain('grant execute on function public.apply_calendar_mutation')
  })
})

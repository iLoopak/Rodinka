/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20260714110000_notifications_reminder_center.sql'), 'utf8').toLowerCase()
const hardeningSql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20260714120000_notifications_hardening.sql'), 'utf8').toLowerCase()
const sourceGuardSql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20260714121000_reminder_source_guards.sql'), 'utf8').toLowerCase()

describe('reminder center migration contract', () => {
  it('persists private member preferences and reminder lifecycle state', () => {
    expect(sql).toContain('create table notification_preferences')
    expect(sql).toContain('create table reminders')
    expect(sql).toContain('read_at timestamptz')
    expect(sql).toContain('dismissed_at timestamptz')
    expect(sql).toContain('resolved_at timestamptz')
    expect(sql).toContain('alter table reminders enable row level security')
    expect(sql).toContain('members read own reminders')
  })

  it('synchronizes deterministically and retains only 90 days of completed history', () => {
    expect(sql).toContain('unique(target_member_id, dedupe_key)')
    expect(sql).toContain('create or replace function sync_member_reminders')
    expect(sql).toContain('on conflict (target_member_id, dedupe_key) do update')
    expect(sql).toContain("interval '90 days'")
    expect(sql).toContain('when reminders.resolved_at is not null then null')
  })

  it('tracks the exact activity payment occurrence that was paid', () => {
    expect(sql).toContain('payment_paid_at timestamptz')
    expect(sql).toContain('payment_paid_for_date date')
  })

  it('serializes concurrent syncs and keeps the unique database guard', () => {
    expect(sql).toContain('unique(target_member_id, dedupe_key)')
    expect(hardeningSql).toContain('pg_advisory_xact_lock')
    expect(hardeningSql).toContain('on conflict (target_member_id, dedupe_key) do update')
    expect(hardeningSql).toContain('is distinct from excluded.metadata')
  })

  it('limits direct state changes to the narrow security-definer RPC', () => {
    expect(hardeningSql).toContain('drop policy if exists "members update own reminders"')
    expect(hardeningSql).toContain('create or replace function set_member_reminder_state')
    expect(hardeningSql).toContain("p_action not in ('read', 'dismiss')")
    expect(hardeningSql).toContain('r.target_member_id = actor_member_id')
  })

  it('rejects nonexistent and cross-family reminder source IDs', () => {
    expect(sourceGuardSql).toContain('reminder_sources_belong_to_family')
    expect(sourceGuardSql).toContain('x.family_id = p_family_id')
    expect(sourceGuardSql).toContain('before insert or update of family_id, source, metadata')
    expect(sourceGuardSql).toContain("when 'document' then false")
  })

  it('deletes only completed history after the real 90-day cutoff', () => {
    expect(hardeningSql).toContain('create index reminders_retention_idx')
    expect(hardeningSql).toContain('resolved_at is not null or dismissed_at is not null')
    expect(hardeningSql).toContain("coalesce(resolved_at, dismissed_at) < now() - interval '90 days'")
  })
})

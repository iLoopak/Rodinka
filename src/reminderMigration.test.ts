/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20260714110000_notifications_reminder_center.sql'), 'utf8').toLowerCase()

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
})

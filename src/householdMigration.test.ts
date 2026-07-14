import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260714160000_household_tasks_occurrence_overrides_member_removal.sql', import.meta.url), 'utf8')

describe('household task and member removal migration', () => {
  it('is retry-safe for new tables, indexes and columns', () => {
    expect(sql).toContain('add column if not exists status')
    expect(sql).toContain('create table if not exists occurrence_overrides')
    expect(sql).toContain('create table if not exists member_removal_audit')
    expect(sql).toContain('on conflict do nothing')
  })

  it('preserves IDs and normalizes legacy chores in place', () => {
    expect(sql).toContain('update chores')
    expect(sql).not.toMatch(/delete from chores/i)
    expect(sql).toContain('requires_approval = true')
  })

  it('enforces member removal and occurrence changes in security-definer commands', () => {
    expect(sql).toContain('create or replace function remove_household_member')
    expect(sql).toContain('The last active administrator cannot be removed')
    expect(sql).toContain("actor.role not in ('admin','parent')")
    expect(sql).toContain('create or replace function set_occurrence_member_override')
    expect(sql).toContain('revoke all on function remove_household_member')
  })

  it('keeps historical participant and assignment snapshots', () => {
    expect(sql).toContain('activity_participant_history')
    expect(sql).toContain('series_assignment_history')
    expect(sql).toContain('assigned_member_id')
    expect(sql).toContain('assignment_was_override')
  })
})

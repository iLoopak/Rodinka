import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const initialSql = readFileSync(new URL('../supabase/migrations/20260717120000_permanently_delete_removed_member.sql', import.meta.url), 'utf8')
const fixSql = readFileSync(new URL('../supabase/migrations/20260717123000_fix_permanently_delete_removed_member_preferences.sql', import.meta.url), 'utf8')
const sql = `${initialSql}\n${fixSql}`

describe('permanent member deletion migration', () => {
  it('exposes a dedicated guarded RPC', () => {
    expect(sql).toContain('create or replace function permanently_delete_removed_member')
    expect(sql).toContain("actor.role not in ('admin','parent')")
    expect(sql).toContain("target.status <> 'removed'")
    expect(sql).toContain('actor.id = target.id')
  })

  it('blocks unsafe active references before deleting the member', () => {
    expect(sql).toContain("chores where family_id = target.family_id and status = 'active' and assigned_to = target.id")
    expect(sql).toContain("activities where family_id = target.family_id and status = 'active'")
    expect(sql).toContain("occurrence_date >= current_date")
    expect(sql).toContain('Unsafe active references remain for this member')
  })

  it('preserves historical rows by nulling member references and returns avatar path for cleanup', () => {
    expect(sql).toContain('alter table chore_completions alter column completed_by drop not null')
    expect(sql).toContain('alter table allowance_ledger alter column member_id drop not null')
    expect(sql).toContain('alter table medical_records alter column patient_id drop not null')
    expect(sql).toContain('update series_assignment_history set member_id = null')
    expect(sql).toContain('update activity_participant_history set member_id = null')
    expect(sql).toContain("'avatar_path', v_avatar_path")
  })

  it('deletes current-family notification preferences for the removed member', () => {
    expect(sql).toContain('delete from notification_preferences where member_id = target.id and family_id = target.family_id')
    expect(sql).not.toContain('reminder' + '_preferences')
  })
})

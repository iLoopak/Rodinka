/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260714000900_chore_recurrence_lifecycle.sql'),
  'utf8'
).toLowerCase()

describe('chore lifecycle migration contract', () => {
  it('backfills structured recurrence and immutable occurrence snapshots', () => {
    expect(sql).toContain("case when recurring then 'weekly' else 'none' end")
    expect(sql).toContain('occurrence_due_date')
    expect(sql).toContain('chore_title')
    expect(sql).toContain('reward_amount')
  })

  it('protects pending completions and one-time reward crediting', () => {
    expect(sql).toContain('chore_completions_one_pending_per_chore_idx')
    expect(sql).toContain('source_chore_completion_id')
    expect(sql).toContain("completion.status <> 'pending_approval'")
  })

  it('advances recurring chores and archives approved one-off chores atomically', () => {
    expect(sql).toContain('create function approve_chore_completion')
    expect(sql).toContain("if definition.recurrence_type = 'none'")
    expect(sql).toContain("update chores set status = 'archived'")
    expect(sql).toContain('next_due_date := get_next_chore_due_date')
    expect(sql).toContain('update chores set due_date = next_due_date')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fix = readFileSync(
  new URL('../supabase/migrations/20260719130000_fix_prepare_chore_completion_ambiguity.sql', import.meta.url),
  'utf8',
)
const original = readFileSync(
  new URL('../supabase/migrations/20260717233000_child_occurrence_completion_guard.sql', import.meta.url),
  'utf8',
)

// Regression pin for: "column reference occurrence_date is ambiguous"
// (Postgres 42702), which broke EVERY task completion app-wide.
//
// prepare_chore_completion() is a BEFORE INSERT trigger on
// chore_completions and is deliberately the single chokepoint shared by
// both write paths (the complete_household_task RPC and the
// RLS-permitted direct insert). It declared a local `occurrence_date`
// and compared it against public.occurrence_overrides, which has a
// column of the same name — so Postgres refused to resolve the
// unqualified reference and no completion could be written.
describe('prepare_chore_completion ambiguity fix', () => {
  it('recreates the trigger function', () => {
    expect(fix).toMatch(/create or replace function public\.prepare_chore_completion\(\)/)
    expect(fix).toContain('returns trigger')
    expect(fix).toContain('security definer')
  })

  it('no longer declares a local named occurrence_date', () => {
    // The declaration block must not reintroduce the colliding name.
    const declare = fix.match(/declare[\s\S]+?begin/)?.[0] ?? ''
    expect(declare).not.toMatch(/\boccurrence_date\s+date\b/)
    expect(declare).toMatch(/\bv_occurrence_date\s+date\b/)
  })

  it('compares the override column against the renamed local, not a bare name', () => {
    // Scoped to the function body: the migration header deliberately
    // quotes the original buggy line as documentation.
    const body = fix.match(/\$\$([\s\S]+)\$\$/)?.[1] ?? ''
    expect(body).toContain('o.occurrence_date=v_occurrence_date')
    expect(body).not.toMatch(/o\.occurrence_date\s*=\s*occurrence_date\b/)
  })

  it('leaves no bare occurrence_date reference that could rebind to a column', () => {
    // Every remaining mention must be either the renamed local or an
    // explicitly qualified column (o.occurrence_date), never bare.
    const body = fix.match(/\$\$([\s\S]+)\$\$/)?.[1] ?? ''
    const bare = [...body.matchAll(/(?<![.\w])occurrence_date\b/g)]
    expect(bare).toHaveLength(0)
  })

  it('preserves the child authorization guards verbatim', () => {
    // This is a pure bug fix: the security model must be untouched.
    expect(fix).toContain('A child can complete only their effective assignment')
    expect(fix).toContain('A child can complete only a scheduled occurrence')
    expect(fix).toContain('Archived task cannot be completed')
    expect(fix).toContain('Active household membership required')
    // Same guards as the original migration.
    for (const guard of [
      'A child can complete only their effective assignment',
      'A child can complete only a scheduled occurrence',
    ]) {
      expect(original).toContain(guard)
    }
  })

  it('preserves every derived column the guard sets', () => {
    for (const column of [
      'new.completed_by',
      'new.occurrence_due_date',
      'new.chore_title',
      'new.reward_amount',
      'new.reward_enabled',
      'new.requires_approval',
      'new.assigned_member_id',
      'new.assignment_was_override',
      'new.task_category',
      'new.status',
      'new.approved_by',
      'new.approved_at',
    ]) {
      expect(fix).toContain(column)
    }
  })

  it('keeps approval routing identical to the original', () => {
    expect(fix).toContain("case when definition.requires_approval then 'pending_approval' else 'approved' end")
    expect(fix).toContain('case when definition.requires_approval then null else now() end')
  })
})

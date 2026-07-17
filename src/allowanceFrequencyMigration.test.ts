import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260718090000_allowance_plan_frequency.sql', import.meta.url), 'utf8')

describe('allowance frequency migration', () => {
  it('keeps existing monthly plans valid without a backfill', () => {
    expect(sql).toContain("add column frequency text not null default 'monthly'")
    expect(sql).toContain("check (frequency in ('weekly', 'monthly'))")
    // Existing rows already carry payout_day and no weekday, so they satisfy
    // the new constraint as they stand.
    expect(sql).toContain('alter column payout_day drop not null')
    expect(sql).toContain('allowance_plans_schedule_check')
  })

  it('lets a plan carry exactly one payout anchor', () => {
    expect(sql).toContain("(frequency = 'monthly' and payout_day is not null and payout_weekday is null)")
    expect(sql).toContain("or (frequency = 'weekly' and payout_weekday is not null and payout_day is null)")
    expect(sql).toContain('check (payout_weekday between 1 and 7)')
  })

  it('normalizes the anchor server-side instead of trusting the client', () => {
    expect(sql).toContain("v_frequency := coalesce(plan_data->>'frequency', 'monthly')")
    expect(sql).toContain("raise exception 'Weekly allowance requires a payout weekday'")
    expect(sql).toContain("raise exception 'Monthly allowance requires a payout day'")
  })

  it('settles either frequency through the same guarded RPCs', () => {
    expect(sql).toContain('create or replace function allowance_is_valid_payout')
    expect(sql).toContain('create or replace function allowance_cycle_period_start')
    expect(sql).toContain("when p_frequency = 'weekly' then p_payout_date - 7")
    expect(sql).toContain('create or replace function credit_monthly_allowance')
    expect(sql).toContain('create or replace function skip_monthly_allowance')
  })

  it('restricts every allowance write to parents', () => {
    // save / delete / credit / skip each re-check authorization themselves.
    expect(sql.match(/if not is_family_parent\(/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toContain('security definer set search_path = public')
  })

  it('deletes only a plan that never settled a cycle, archiving the rest', () => {
    expect(sql).toContain('create or replace function delete_allowance_plan')
    expect(sql).toContain('if exists (select 1 from allowance_cycles where plan_id = target_plan_id) then')
    expect(sql).toContain("update allowance_plans set status = 'archived'")
    expect(sql).toContain('delete from allowance_plans where id = target_plan_id')
  })
})

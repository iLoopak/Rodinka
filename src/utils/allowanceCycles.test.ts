import { describe, expect, it } from 'vitest'
import {
  allowanceCycleForPayout,
  evaluateAllowanceRequirements,
  nextCycleForPlan,
  nextPayoutDate,
  payoutDateForMonth,
  weeklyRequirementBuckets,
  unsettledDuePayoutDates,
} from './allowanceCycles'

describe('allowance cycle dates', () => {
  it('uses a payout-day anchored cycle', () => {
    expect(allowanceCycleForPayout({ payout_day: 15, starts_on: '2026-01-01' }, '2026-07-15'))
      .toEqual({ payoutDate: '2026-07-15', periodStart: '2026-06-15', periodEnd: '2026-07-15' })
  })
  it('crosses a year boundary', () => expect(nextPayoutDate('2026-12-20', 15)).toBe('2027-01-15'))
  it('clamps day 31 in ordinary February', () => expect(payoutDateForMonth(2026, 1, 31)).toBe('2026-02-28'))
  it('clamps day 31 in leap February', () => expect(payoutDateForMonth(2028, 1, 31)).toBe('2028-02-29'))
  it('clamps day 31 in April', () => expect(payoutDateForMonth(2026, 3, 31)).toBe('2026-04-30'))
  it('clamps the first cycle to starts_on', () => {
    expect(allowanceCycleForPayout({ payout_day: 15, starts_on: '2026-07-01' }, '2026-07-15').periodStart)
      .toBe('2026-07-01')
  })
  it('does not produce due state for paused plans', () => {
    expect(nextCycleForPlan({ payout_day: 15, starts_on: '2026-01-01', status: 'paused' }, '2026-07-15')).toBeNull()
  })
  it('returns every unsettled due cycle without reoffering settled dates', () => {
    expect(unsettledDuePayoutDates(
      { payout_day: 15, starts_on: '2026-04-20', status: 'active' }, ['2026-05-15'], '2026-07-20'
    )).toEqual(['2026-06-15', '2026-07-15'])
  })
})

describe('allowance requirements', () => {
  const cycle = { payoutDate: '2026-07-15', periodStart: '2026-06-15', periodEnd: '2026-07-15' }
  const completion = (date: string, status: 'approved' | 'pending_approval' | 'rejected' = 'approved') => ({
    chore_id: 'chore', completed_by: 'child', completed_at: `${date}T12:00:00Z`, status,
  })
  it('makes an unconditional plan eligible', () => {
    expect(evaluateAllowanceRequirements('child', 'none', [], [], cycle).eligible).toBe(true)
  })
  it('evaluates per-cycle approved counts and ignores pending/rejected/outside items', () => {
    const result = evaluateAllowanceRequirements('child', 'chores', [
      { chore_id: 'chore', requirement_type: 'per_cycle', required_count: 2 },
    ], [completion('2026-06-20'), completion('2026-07-01'), completion('2026-07-02', 'pending_approval'), completion('2026-07-03', 'rejected'), completion('2026-05-01')], cycle)
    expect(result.eligible).toBe(true)
    expect(result.progress[0]).toMatchObject({ approvedCount: 2, pendingCount: 1 })
  })
  it('requires every included week for a weekly requirement', () => {
    const buckets = weeklyRequirementBuckets(cycle.periodStart, cycle.periodEnd)
    const completions = buckets.map((bucket) => completion(bucket.start))
    const requirement = [{ chore_id: 'chore', requirement_type: 'weekly' as const, required_count: 1 }]
    expect(evaluateAllowanceRequirements('child', 'chores', requirement, completions, cycle).eligible).toBe(true)
    expect(evaluateAllowanceRequirements('child', 'chores', requirement, completions.slice(1), cycle).eligible).toBe(false)
  })
  it('can become eligible when a late approval changes current status', () => {
    const requirement = [{ chore_id: 'chore', requirement_type: 'per_cycle' as const, required_count: 1 }]
    expect(evaluateAllowanceRequirements('child', 'chores', requirement, [completion('2026-07-01', 'pending_approval')], cycle).eligible).toBe(false)
    expect(evaluateAllowanceRequirements('child', 'chores', requirement, [completion('2026-07-01', 'approved')], cycle).eligible).toBe(true)
  })
})

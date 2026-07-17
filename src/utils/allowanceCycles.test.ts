import { describe, expect, it } from 'vitest'
import {
  allowanceCycleForPayout,
  evaluateAllowanceRequirements,
  isValidPayoutDate,
  nextCycleForPlan,
  nextPayoutDate,
  payoutDateForMonth,
  weeklyRequirementBuckets,
  unsettledDuePayoutDates,
} from './allowanceCycles'

const monthly = (payoutDay: number, startsOn: string) => ({
  frequency: 'monthly' as const, payout_day: payoutDay, payout_weekday: null, starts_on: startsOn,
})
// payout_weekday is an ISO weekday: 1 = Monday … 7 = Sunday.
const weekly = (weekday: number, startsOn: string) => ({
  frequency: 'weekly' as const, payout_day: null, payout_weekday: weekday, starts_on: startsOn,
})

describe('monthly allowance cycle dates', () => {
  it('uses a payout-day anchored cycle', () => {
    expect(allowanceCycleForPayout(monthly(15, '2026-01-01'), '2026-07-15'))
      .toEqual({ payoutDate: '2026-07-15', periodStart: '2026-06-15', periodEnd: '2026-07-15' })
  })
  it('crosses a year boundary', () => expect(nextPayoutDate('2026-12-20', monthly(15, '2026-01-01'))).toBe('2027-01-15'))
  it('clamps day 31 in ordinary February', () => expect(payoutDateForMonth(2026, 1, 31)).toBe('2026-02-28'))
  it('clamps day 31 in leap February', () => expect(payoutDateForMonth(2028, 1, 31)).toBe('2028-02-29'))
  it('clamps day 31 in April', () => expect(payoutDateForMonth(2026, 3, 31)).toBe('2026-04-30'))
  it('clamps the first cycle to starts_on', () => {
    expect(allowanceCycleForPayout(monthly(15, '2026-07-01'), '2026-07-15').periodStart).toBe('2026-07-01')
  })
  it('does not produce due state for paused plans', () => {
    expect(nextCycleForPlan({ ...monthly(15, '2026-01-01'), status: 'paused' }, '2026-07-15')).toBeNull()
  })
  it('returns every unsettled due cycle without reoffering settled dates', () => {
    expect(unsettledDuePayoutDates(
      { ...monthly(15, '2026-04-20'), status: 'active' }, ['2026-05-15'], '2026-07-20'
    )).toEqual(['2026-06-15', '2026-07-15'])
  })
  it('walks past a clamped payout without repeating or skipping a month', () => {
    expect(unsettledDuePayoutDates(
      { ...monthly(31, '2026-01-31'), status: 'active' }, [], '2026-04-30'
    )).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
})

describe('weekly allowance cycle dates', () => {
  // 2026-07-19 is a Sunday.
  it('anchors the cycle on the payout weekday and looks back seven days', () => {
    expect(allowanceCycleForPayout(weekly(7, '2026-01-01'), '2026-07-19'))
      .toEqual({ payoutDate: '2026-07-19', periodStart: '2026-07-12', periodEnd: '2026-07-19' })
  })
  it('returns the same day when fromDate already is the payout weekday', () => {
    expect(nextPayoutDate('2026-07-19', weekly(7, '2026-01-01'))).toBe('2026-07-19')
  })
  it('finds the next matching weekday', () => {
    expect(nextPayoutDate('2026-07-20', weekly(7, '2026-01-01'))).toBe('2026-07-26')
    expect(nextPayoutDate('2026-07-20', weekly(1, '2026-01-01'))).toBe('2026-07-20')
  })
  it('clamps the first cycle to starts_on', () => {
    expect(allowanceCycleForPayout(weekly(7, '2026-07-15'), '2026-07-19').periodStart).toBe('2026-07-15')
  })
  it('rejects a payout date that is not the plan weekday', () => {
    expect(isValidPayoutDate(weekly(7, '2026-01-01'), '2026-07-18')).toBe(false)
    expect(() => allowanceCycleForPayout(weekly(7, '2026-01-01'), '2026-07-18')).toThrow()
  })
  it('lists consecutive weekly cycles and honours settled dates', () => {
    expect(unsettledDuePayoutDates(
      { ...weekly(7, '2026-07-01'), status: 'active' }, ['2026-07-12'], '2026-07-20'
    )).toEqual(['2026-07-05', '2026-07-19'])
  })
  it('does not produce due state for paused plans', () => {
    expect(nextCycleForPlan({ ...weekly(7, '2026-01-01'), status: 'paused' }, '2026-07-19')).toBeNull()
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

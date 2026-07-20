import { describe, expect, it } from 'vitest'
import { balancesFromLedger, mapAllowanceCycle, mapLedgerEntry, mapAllowancePlan, money } from './allowanceMappers'
import type { LedgerEntry } from '../../../hooks/useAllowanceLedger'

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: 'l1', member_id: 'm1', amount: 100, reason: null, created_at: '2026-07-20T10:00:00Z',
    entry_type: 'monthly_allowance', source_chore_completion_id: null, source_allowance_cycle_id: null,
    ...overrides,
  }
}

describe('allowance mappers', () => {
  it('parses money that arrives from numeric as a string', () => {
    // A forgotten Number() here turns a balance into string concatenation,
    // which produces a wrong total rather than an error anyone notices.
    expect(money('450.50')).toBe(450.5)
    expect(mapLedgerEntry({ id: 'l1', amount: '12.25' }).amount).toBe(12.25)
    expect(mapAllowancePlan({ id: 'p1', amount: '300' }).amount).toBe(300)
  })

  it('treats an unparseable amount as zero rather than NaN', () => {
    // NaN would propagate silently through every subsequent sum.
    expect(money('not money')).toBe(0)
    expect(money(null)).toBe(0)
  })

  it('keeps an unsettled cycle distinct from one settled at zero', () => {
    expect(mapAllowanceCycle({ id: 'c1', credited_amount: null }).credited_amount).toBeNull()
    expect(mapAllowanceCycle({ id: 'c1', credited_amount: '0' }).credited_amount).toBe(0)
  })

  it('defaults a plan with no requirements to an empty list', () => {
    expect(mapAllowancePlan({ id: 'p1' }).requirements).toEqual([])
    expect(mapAllowancePlan({ id: 'p1', allowance_plan_requirements: null }).requirements).toEqual([])
  })

  it('sums a member balance across entry types', () => {
    const balances = balancesFromLedger([
      entry({ id: 'a', amount: 300, entry_type: 'monthly_allowance' }),
      entry({ id: 'b', amount: 50, entry_type: 'chore_reward' }),
      entry({ id: 'c', amount: -100, entry_type: 'payout' }),
    ])
    expect(balances.get('m1')).toBe(250)
  })

  it('leaves entries belonging to a removed member out of every balance', () => {
    // The ledger is append-only, so a removed member's history stays. It just
    // no longer belongs to anybody's balance.
    const balances = balancesFromLedger([
      entry({ id: 'a', member_id: 'm1', amount: 100 }),
      entry({ id: 'b', member_id: null, amount: 999 }),
    ])
    expect(balances.get('m1')).toBe(100)
    expect([...balances.keys()]).toEqual(['m1'])
  })

  it('keeps balances separate per member', () => {
    const balances = balancesFromLedger([
      entry({ id: 'a', member_id: 'm1', amount: 100 }),
      entry({ id: 'b', member_id: 'm2', amount: 40 }),
    ])
    expect(balances.get('m1')).toBe(100)
    expect(balances.get('m2')).toBe(40)
  })
})

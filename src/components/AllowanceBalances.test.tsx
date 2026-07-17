import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../strings'
import { AllowanceBalances } from './AllowanceBalances'

const child = {
  id: 'child-1', family_id: 'family-1', display_name: 'Alex', role: 'child' as const,
  user_id: 'user-1', birth_date: null, color_key: null, avatar_path: null,
  avatar_url: null, grammatical_gender: null, vocative_name: null,
}

describe('AllowanceBalances child view', () => {
  it('shows the child balance and history without management actions', () => {
    const html = renderToStaticMarkup(createElement(AllowanceBalances, {
      kids: [child], balances: new Map([[child.id, 125]]), chores: [], completions: [], plans: [], cycles: [],
      entries: [{
        id: 'entry-1', member_id: child.id, amount: 25, reason: 'Hotový úkol',
        created_at: '2026-07-16T10:00:00Z', entry_type: 'chore_reward',
        source_chore_completion_id: null, source_allowance_cycle_id: null,
      }],
      canManage: false, onPayout: vi.fn(), onSavePlan: vi.fn(), onCredit: vi.fn(), onSkip: vi.fn(),
    }))

    expect(html).toContain(t.allowance.historyTitle)
    expect(html).toContain('Hotový úkol')
    expect(html).not.toContain(t.chores.payoutButton)
    expect(html).not.toContain(t.allowance.manage)
    expect(html).not.toContain(t.allowance.credit)
    expect(html).not.toContain(t.allowance.skip)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { changeLanguage } from '../../i18n'
import type { TodayAttentionItem } from '../../utils/todayAgenda'
import { todayAttentionReasonLabel } from './todayAttentionReason'

const item = (kind: TodayAttentionItem['kind'], date: string | null): TodayAttentionItem => ({
  id: 'attention-1', kind, itemType: 'chore', title: 'Task', personId: null,
  responsibleMemberId: null, date, route: '/chores',
})

afterEach(async () => { await changeLanguage('cs') })

describe('Today attention reason labels', () => {
  it('shows the resolved overdue date in Czech without repeating the fallback', async () => {
    await changeLanguage('cs')
    expect(todayAttentionReasonLabel(item('overdue_chore', '2026-07-14'))).toBe('Úkol je po termínu · 14. 7.')
  })

  it('uses a complete Czech fallback when no date can be resolved', async () => {
    await changeLanguage('cs')
    expect(todayAttentionReasonLabel(item('overdue_chore', null))).toBe('Úkol je po termínu')
  })

  it('keeps resolved and unresolved English wording equivalent', async () => {
    await changeLanguage('en')
    expect(todayAttentionReasonLabel(item('overdue_payment', '2026-07-14'))).toBe('Payment is overdue · Jul 14')
    expect(todayAttentionReasonLabel(item('overdue_medical', null))).toBe('Health date is overdue')
  })
})

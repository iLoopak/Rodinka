import { describe, expect, it } from 'vitest'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import { getChoreState } from './choreState'
import { makeChore } from './testFixtures'

function completion(status: ChoreCompletion['status']): ChoreCompletion {
  return {
    id: 'completion-1', chore_id: 'chore-1', completed_by: 'member-1',
    completed_at: '2026-07-14T10:00:00Z', status, approved_by: null, approved_at: null,
    occurrence_due_date: '2026-07-14', chore_title: 'Chore', reward_amount: 10,
  }
}

describe('chore occurrence state', () => {
  it('keeps an approved one-off chore done', () => {
    expect(getChoreState(makeChore({ status: 'archived', due_date: '2026-07-14' }), completion('approved'))).toBe('done')
  })

  it('makes the next recurring occurrence actionable after approval', () => {
    expect(getChoreState(makeChore({ recurrence_type: 'weekly', recurring: true, due_date: '2026-07-21' }), completion('approved'))).toBe('actionable')
  })

  it('keeps pending work non-actionable', () => {
    expect(getChoreState(makeChore(), completion('pending_approval'))).toBe('pending')
  })

  it('distinguishes a manually archived chore from a completed one-off', () => {
    expect(getChoreState(makeChore({ status: 'archived', recurrence_type: 'weekly', recurring: true }), completion('approved'))).toBe('archived')
  })

  it('keeps a new current occurrence actionable after switching recurrence to none', () => {
    expect(getChoreState(makeChore({ due_date: '2026-07-21', recurrence_type: 'none', recurring: false }), completion('approved'))).toBe('actionable')
  })
})

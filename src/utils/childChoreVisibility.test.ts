import { describe, expect, it } from 'vitest'
import { makeChore } from './testFixtures'
import { childVisibleChores } from './childChoreVisibility'

describe('childVisibleChores', () => {
  it('keeps only the current child tasks and resolves one-off overrides', () => {
    const chores = [
      makeChore({ id: 'own', assigned_to: 'child-a' }),
      makeChore({ id: 'sibling', assigned_to: 'child-b' }),
      makeChore({ id: 'overridden', assigned_to: 'child-b', due_date: '2026-07-20' }),
    ]
    const visible = childVisibleChores('child-a', chores, [{
      id: 'override-1', family_id: 'family-1', series_type: 'task', series_id: 'overridden',
      occurrence_date: '2026-07-20', companion_member_id: null, assignee_member_id: 'child-a',
      cancelled: false, updated_at: '2026-07-19T10:00:00Z',
    }], [])

    expect(visible.map((chore) => chore.id)).toEqual(['own', 'overridden'])
    expect(visible[1].assigned_to).toBe('child-a')
  })
})

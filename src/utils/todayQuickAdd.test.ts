import { describe, expect, it } from 'vitest'
import { createQuickShoppingItemInput, createQuickTaskInput, isQuickTodo } from './todayQuickAdd'
import { makeChore } from './testFixtures'

describe('Today quick add defaults', () => {
  it('creates an ordinary unassigned task without a due date, reward, or approval', () => {
    expect(createQuickTaskInput('  Opravit poličku  ')).toEqual(expect.objectContaining({
      title: 'Opravit poličku',
      assignedTo: null,
      dueDate: null,
      rewardAmount: 0,
      rewardEnabled: false,
      requiresApproval: false,
      recurrenceType: 'none',
    }))
  })

  it('creates a minimal unassigned shopping item', () => {
    expect(createQuickShoppingItemInput('  Mléko  ')).toEqual({
      name: 'Mléko',
      quantity: null,
      unit: null,
      note: '',
      category: 'other',
      responsibleMemberId: null,
    })
  })

  it('keeps only underspecified active tasks in the quick todo inbox', () => {
    expect(isQuickTodo(makeChore({
      assigned_to: null, due_date: null, description: null, reward_enabled: false,
      requires_approval: false, category: null, priority: 'normal', recurrence_type: 'none', status: 'active',
    }))).toBe(true)
    expect(isQuickTodo(makeChore({ assigned_to: 'member-1', due_date: null }))).toBe(false)
    expect(isQuickTodo(makeChore({ assigned_to: null, due_date: '2026-07-18' }))).toBe(false)
    expect(isQuickTodo(makeChore({ assigned_to: null, due_date: null, status: 'archived' }))).toBe(false)
  })
})

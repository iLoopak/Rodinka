import type { ChoreInput } from './choreModel'
import type { Chore } from './choreModel'
import type { ShoppingItemInput } from './shopping'

export function createQuickTaskInput(title: string): ChoreInput {
  return {
    title: title.trim(),
    description: '',
    assignedTo: null,
    dueDate: null,
    rewardAmount: 0,
    rewardEnabled: false,
    rewardCurrency: 'CZK',
    requiresApproval: false,
    category: null,
    priority: 'normal',
    recurrenceType: 'none',
    recurrenceWeekdays: null,
    preferredDayOfMonth: null,
  }
}

export function createQuickShoppingItemInput(name: string): ShoppingItemInput {
  return {
    name: name.trim(),
    quantity: null,
    unit: null,
    note: '',
    category: 'other',
    responsibleMemberId: null,
  }
}

export function isQuickTodo(chore: Chore): boolean {
  return chore.status === 'active'
    && chore.assigned_to === null
    && chore.due_date === null
    && !chore.description
    && !chore.reward_enabled
    && !chore.requires_approval
    && chore.category === null
    && (chore.priority === null || chore.priority === 'normal')
    && chore.recurrence_type === 'none'
}

import { describe, expect, it } from 'vitest'
import { getPlannerDatePrefill, type PlannerItemType } from './plannerCreate'

describe('getPlannerDatePrefill', () => {
  it.each([
    ['chore', 'dueDate'],
    ['activity', 'startDate'],
    ['medical', 'recordDate'],
    ['meal', 'entryDate'],
  ] as const)('maps %s to %s', (type, field) => {
    expect(getPlannerDatePrefill(type, '2026-07-13')).toEqual({ field, value: '2026-07-13' })
  })

  it.each(['chore', 'activity', 'medical', 'meal'] as PlannerItemType[])(
    'does not invent a date for %s',
    (type) => {
      expect(getPlannerDatePrefill(type)).toBeNull()
    }
  )
})

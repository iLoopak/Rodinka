import { Dumbbell, Goal, Waves } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { getItemTypeStyle } from './itemTypeStyle'

describe('getItemTypeStyle activity category', () => {
  it('uses the category-specific icon when a category is supplied', () => {
    expect(getItemTypeStyle('activity', 'swimming').Icon).toBe(Waves)
    expect(getItemTypeStyle('activity', 'football').Icon).toBe(Goal)
  })

  it('falls back to the generic icon when no category is known', () => {
    expect(getItemTypeStyle('activity').Icon).toBe(Dumbbell)
  })

  it('ignores an activity category for non-activity types', () => {
    expect(getItemTypeStyle('chore').Icon).not.toBe(Waves)
  })
})

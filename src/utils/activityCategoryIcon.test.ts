import { describe, expect, it } from 'vitest'
import { activityCategoryIcon } from './activityCategoryIcon'
import { ACTIVITY_CATEGORY_VALUES } from './activityLabels'

describe('activityCategoryIcon', () => {
  it('returns an icon component for every activity category', () => {
    for (const category of ACTIVITY_CATEGORY_VALUES) {
      expect(activityCategoryIcon(category)).toBeTruthy()
    }
  })

  it('gives swimming and football visibly different icons (the bug this fixes)', () => {
    expect(activityCategoryIcon('swimming')).not.toBe(activityCategoryIcon('football'))
  })

  it('gives every category its own icon (no accidental duplicates)', () => {
    const icons = ACTIVITY_CATEGORY_VALUES.map(activityCategoryIcon)
    expect(new Set(icons).size).toBe(ACTIVITY_CATEGORY_VALUES.length)
  })
})

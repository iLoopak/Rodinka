import { describe, expect, it } from 'vitest'
import { isInitialFamilyDataLoad } from './familyDataLoading'

describe('family data loading state', () => {
  it('uses global loading for the first load and a family switch', () => {
    expect(isInitialFamilyDataLoad(undefined, 'family-a')).toBe(true)
    expect(isInitialFamilyDataLoad('family-a', 'family-b')).toBe(true)
  })

  it('keeps a post-save refresh in the background for the loaded family', () => {
    expect(isInitialFamilyDataLoad('family-a', 'family-a')).toBe(false)
    expect(isInitialFamilyDataLoad(undefined, undefined)).toBe(false)
  })
})

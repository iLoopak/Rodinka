import { describe, expect, it } from 'vitest'
import { getNativePlatform, isNativeApp } from './capacitor'

describe('capacitor platform detection', () => {
  it('reports web by default in a test/browser environment', () => {
    expect(isNativeApp()).toBe(false)
    expect(getNativePlatform()).toBe('web')
  })
})

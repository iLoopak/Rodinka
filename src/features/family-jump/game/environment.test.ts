import { describe, expect, it } from 'vitest'
import { GAME_CONFIG } from '../config/gameConfig'
import { ENVIRONMENT_THEMES, environmentBlendAtHeight, themeForSegment } from './environment'

describe('Family Jump height-driven environments', () => {
  it('keeps each environment within the requested height range', () => {
    expect(GAME_CONFIG.environment.segmentHeightMeters).toBeGreaterThanOrEqual(300)
    expect(GAME_CONFIG.environment.segmentHeightMeters).toBeLessThanOrEqual(600)
    expect(GAME_CONFIG.environment.transitionMeters).toBeLessThan(GAME_CONFIG.environment.segmentHeightMeters)
  })

  it('visits all five themes before repeating them in a different order', () => {
    const firstCycle = Array.from({ length: ENVIRONMENT_THEMES.length }, (_, index) => themeForSegment(index).id)
    const secondCycle = Array.from({ length: ENVIRONMENT_THEMES.length }, (_, index) => themeForSegment(index + ENVIRONMENT_THEMES.length).id)

    expect(new Set(firstCycle)).toEqual(new Set(['playroom', 'kitchen', 'laundry', 'study', 'garden']))
    expect(new Set(firstCycle).size).toBe(ENVIRONMENT_THEMES.length)
    expect(new Set(secondCycle).size).toBe(ENVIRONMENT_THEMES.length)
    expect(secondCycle).not.toEqual(firstCycle)
    expect(secondCycle[0]).not.toBe(firstCycle.at(-1))
  })

  it('crossfades near a height boundary and advances exactly at the next segment', () => {
    const segment = GAME_CONFIG.environment.segmentHeightMeters
    const transition = GAME_CONFIG.environment.transitionMeters
    const beforeTransition = environmentBlendAtHeight(segment - transition - 1)
    const duringTransition = environmentBlendAtHeight(segment - transition / 2)
    const nextSegment = environmentBlendAtHeight(segment)

    expect(beforeTransition.progress).toBe(0)
    expect(duringTransition.progress).toBeGreaterThan(0)
    expect(duringTransition.progress).toBeLessThan(1)
    expect(nextSegment.progress).toBe(0)
    expect(nextSegment.current.id).toBe(beforeTransition.next.id)
  })

  it('derives the theme only from reached height', () => {
    expect(environmentBlendAtHeight(840)).toEqual(environmentBlendAtHeight(840))
    expect(environmentBlendAtHeight(-50)).toEqual(environmentBlendAtHeight(0))
  })
})

import { describe, expect, it } from 'vitest'
import { GAME_CONFIG } from '../config/gameConfig'
import type { JumpPlatform, JumpPlayer } from '../types/game'
import {
  applyGravity,
  bouncedVelocity,
  createInitialGameState,
  findLandingPlatform,
  generateNextPlatform,
  isReachablePlatformStep,
  scoreFromClimbedPixels,
  stepGame,
  wrapHorizontal,
} from './core'

const platform: JumpPlatform = { id: 1, kind: 'stable', x: 80, y: 200, width: 86, height: 14, impactAnimation: 0 }

function player(input: Partial<JumpPlayer> = {}): JumpPlayer {
  return {
    x: 100,
    y: 150,
    width: GAME_CONFIG.player.width,
    height: GAME_CONFIG.player.height,
    velocityX: 0,
    velocityY: 120,
    landingAnimation: 0,
    ...input,
  }
}

describe('Family Jump core physics', () => {
  it('applies gravity using delta time and caps the fall speed', () => {
    expect(applyGravity(0, 0.5)).toBe(GAME_CONFIG.gravity * 0.5)
    expect(applyGravity(1_000, 1)).toBe(GAME_CONFIG.maximumFallSpeed)
  })

  it('uses the configured automatic bounce impulse', () => {
    expect(bouncedVelocity()).toBe(GAME_CONFIG.jumpVelocity)
    expect(bouncedVelocity()).toBeLessThan(0)
  })

  it('wraps fully departed players across both horizontal edges', () => {
    expect(wrapHorizontal(-39, 38, 320)).toBe(320)
    expect(wrapHorizontal(321, 38, 320)).toBe(-38)
    expect(wrapHorizontal(100, 38, 320)).toBe(100)
  })

  it('lands only while descending through the platform top', () => {
    const previousY = platform.y - GAME_CONFIG.player.height - 7
    const crossingY = platform.y - GAME_CONFIG.player.height + 2
    expect(findLandingPlatform(player({ y: crossingY }), previousY, [platform])).toBe(platform)
    expect(findLandingPlatform(player({ y: crossingY, velocityY: -120 }), previousY, [platform])).toBeNull()
    expect(findLandingPlatform(player({ x: 200, y: crossingY }), previousY, [platform])).toBeNull()
    expect(findLandingPlatform(player({ y: 205 }), 201, [platform])).toBeNull()
  })

  it('derives score only from climbed distance', () => {
    expect(scoreFromClimbedPixels(0)).toBe(0)
    expect(scoreFromClimbedPixels(964)).toBe(482)
  })

  it('increases climbed distance when the player crosses the camera threshold', () => {
    const viewport = { width: 320, height: 560 }
    const state = createInitialGameState(viewport, () => 0.5)
    state.player.y = viewport.height * GAME_CONFIG.cameraThresholdRatio - 12
    state.player.velocityY = -300
    stepGame(state, { left: false, right: false }, 1 / 120, viewport, () => 0.5)
    expect(state.climbedPixels).toBeGreaterThan(0)
    expect(state.score).toBe(scoreFromClimbedPixels(state.climbedPixels))
  })
})

describe('Family Jump platform generation', () => {
  it('keeps every required next platform within configured reach', () => {
    let previous = platform
    let seed = 17
    const random = () => {
      seed = (seed * 48_271) % 2_147_483_647
      return seed / 2_147_483_647
    }
    for (let id = 2; id < 102; id += 1) {
      const next = generateNextPlatform(previous, 360, id, random)
      expect(isReachablePlatformStep(previous, next)).toBe(true)
      expect(next.x).toBeGreaterThanOrEqual(0)
      expect(next.x + next.width).toBeLessThanOrEqual(360)
      previous = next
    }
  })

  it('starts with gentler gaps and prevents long one-sided platform runs', () => {
    let previous = platform
    let previousDirection: -1 | 0 | 1 = 0
    let sameDirectionCount = 0
    let largestDirectionRun = 0
    let sameDirectionPairs = 0
    let seed = 41
    const random = () => {
      seed = (seed * 48_271) % 2_147_483_647
      return seed / 2_147_483_647
    }
    for (let id = 2; id < 82; id += 1) {
      const next = generateNextPlatform(previous, 320, id, random, {
        progress: 0,
        previousDirection,
        sameDirectionCount,
      })
      expect(previous.y - next.y).toBeLessThanOrEqual(GAME_CONFIG.platformSpacing.beginnerMaximumVertical)
      const direction = Math.sign(next.x - previous.x) as -1 | 0 | 1
      if (direction !== 0 && direction === previousDirection) {
        sameDirectionCount += 1
        sameDirectionPairs += 1
      } else {
        previousDirection = direction
        sameDirectionCount = direction === 0 ? 0 : 1
      }
      largestDirectionRun = Math.max(largestDirectionRun, sameDirectionCount)
      previous = next
    }
    expect(largestDirectionRun).toBeLessThanOrEqual(2)
    expect(sameDirectionPairs).toBeGreaterThan(0)
  })

  it('records a visual platform impact without changing its collision position', () => {
    const viewport = { width: 320, height: 560 }
    const state = createInitialGameState(viewport, () => 0.5)
    const landing = state.platforms[0]
    const originalY = landing.y
    state.player.x = landing.x + 10
    state.player.y = landing.y - state.player.height - 1
    state.player.velocityY = 180
    stepGame(state, { left: false, right: false }, 1 / 120, viewport, () => 0.5)
    expect(landing.impactAnimation).toBe(1)
    expect(landing.y).toBe(originalY)
  })
})

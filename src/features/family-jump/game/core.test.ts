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

const platform: JumpPlatform = { id: 1, kind: 'stable', x: 80, y: 200, width: 86, height: 14 }

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
    expect(findLandingPlatform(player({ y: 162 }), 150, [platform])).toBe(platform)
    expect(findLandingPlatform(player({ y: 162, velocityY: -120 }), 150, [platform])).toBeNull()
    expect(findLandingPlatform(player({ x: 200, y: 162 }), 150, [platform])).toBeNull()
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
})

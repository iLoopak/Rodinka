import { GAME_CONFIG } from '../config/gameConfig'
import type { JumpGameState, JumpInput, JumpPlatform, JumpPlayer, JumpViewport } from '../types/game'

export type RandomSource = () => number
export type PlatformDirection = -1 | 0 | 1

interface PlatformGenerationOptions {
  progress?: number
  previousDirection?: PlatformDirection
  sameDirectionCount?: number
}

export function applyGravity(velocityY: number, deltaSeconds: number): number {
  return Math.min(
    GAME_CONFIG.maximumFallSpeed,
    velocityY + GAME_CONFIG.gravity * deltaSeconds,
  )
}

export function bouncedVelocity(): number {
  return GAME_CONFIG.jumpVelocity
}

export function updateHorizontalVelocity(
  velocityX: number,
  input: JumpInput,
  deltaSeconds: number,
): number {
  const direction = Number(input.right) - Number(input.left)
  if (direction !== 0) {
    return clamp(
      velocityX + direction * GAME_CONFIG.horizontalAcceleration * deltaSeconds,
      -GAME_CONFIG.maximumHorizontalSpeed,
      GAME_CONFIG.maximumHorizontalSpeed,
    )
  }
  const slowed = velocityX * Math.exp(-GAME_CONFIG.horizontalFriction * deltaSeconds)
  return Math.abs(slowed) < 0.5 ? 0 : slowed
}

export function wrapHorizontal(x: number, playerWidth: number, viewportWidth: number): number {
  if (x + playerWidth < 0) return viewportWidth
  if (x > viewportWidth) return -playerWidth
  return x
}

export function findLandingPlatform(
  player: JumpPlayer,
  previousY: number,
  platforms: readonly JumpPlatform[],
): JumpPlatform | null {
  if (player.velocityY <= 0) return null
  const previousBottom = previousY + player.height
  const currentBottom = player.y + player.height
  const playerRight = player.x + player.width

  let landing: JumpPlatform | null = null
  for (const platform of platforms) {
    const crossesTop = previousBottom <= platform.y && currentBottom >= platform.y
    const overlaps = playerRight > platform.x && player.x < platform.x + platform.width
    if (crossesTop && overlaps && (!landing || platform.y < landing.y)) landing = platform
  }
  return landing
}

export function scoreFromClimbedPixels(climbedPixels: number): number {
  return Math.max(0, Math.floor(climbedPixels * GAME_CONFIG.metersPerPixel))
}

export function generateNextPlatform(
  previous: JumpPlatform,
  viewportWidth: number,
  id: number,
  random: RandomSource = Math.random,
  options: PlatformGenerationOptions = {},
): JumpPlatform {
  const progress = clamp(options.progress ?? 1, 0, 1)
  const maximumVertical = interpolate(
    GAME_CONFIG.platformSpacing.beginnerMaximumVertical,
    GAME_CONFIG.platformSpacing.maximumVertical,
    progress,
  )
  const maximumHorizontal = interpolate(
    GAME_CONFIG.platformSpacing.beginnerMaximumHorizontal,
    GAME_CONFIG.platformSpacing.maximumHorizontal,
    progress,
  )
  const verticalGap = randomBetween(
    GAME_CONFIG.platformSpacing.minimumVertical,
    maximumVertical,
    random,
  )
  const previousDirection = options.previousDirection ?? 0
  const forceTurn = previousDirection !== 0 && (options.sameDirectionCount ?? 0) >= 2
  let direction: PlatformDirection = random() < 0.5 ? -1 : 1
  if (forceTurn) direction = previousDirection === 1 ? -1 : 1
  const horizontalDistance = randomBetween(
    GAME_CONFIG.platformSpacing.minimumHorizontal,
    maximumHorizontal,
    random,
  )
  const maximumX = Math.max(0, viewportWidth - GAME_CONFIG.platform.width)
  let nextX = previous.x + direction * horizontalDistance
  if (nextX < 0 || nextX > maximumX) {
    direction = direction === 1 ? -1 : 1
    nextX = previous.x + direction * horizontalDistance
  }
  return {
    id,
    kind: 'stable',
    x: clamp(nextX, 0, maximumX),
    y: previous.y - verticalGap,
    width: GAME_CONFIG.platform.width,
    height: GAME_CONFIG.platform.height,
    impactAnimation: 0,
  }
}

export function isReachablePlatformStep(lower: JumpPlatform, upper: JumpPlatform): boolean {
  const verticalGap = lower.y - upper.y
  const horizontalGap = Math.abs(lower.x - upper.x)
  return verticalGap >= GAME_CONFIG.platformSpacing.minimumVertical
    && verticalGap <= GAME_CONFIG.platformSpacing.maximumVertical
    && horizontalGap <= GAME_CONFIG.platformSpacing.maximumHorizontal
}

export function createInitialGameState(
  viewport: JumpViewport,
  random: RandomSource = Math.random,
): JumpGameState {
  const startPlatform: JumpPlatform = {
    id: 1,
    kind: 'stable',
    x: Math.max(0, viewport.width / 2 - GAME_CONFIG.platform.width / 2),
    y: viewport.height - 68,
    width: GAME_CONFIG.platform.width,
    height: GAME_CONFIG.platform.height,
    impactAnimation: 0,
  }
  const state: JumpGameState = {
    player: {
      x: viewport.width / 2 - GAME_CONFIG.player.width / 2,
      y: startPlatform.y - GAME_CONFIG.player.height,
      width: GAME_CONFIG.player.width,
      height: GAME_CONFIG.player.height,
      velocityX: 0,
      velocityY: bouncedVelocity(),
      landingAnimation: 0,
    },
    platforms: [startPlatform],
    nextPlatformId: 2,
    climbedPixels: 0,
    score: 0,
    gameOver: false,
    lastPlatformDirection: 0,
    sameDirectionPlatformCount: 0,
  }
  replenishPlatforms(state, viewport, random)
  return state
}

export function stepGame(
  state: JumpGameState,
  input: JumpInput,
  deltaSeconds: number,
  viewport: JumpViewport,
  random: RandomSource = Math.random,
) {
  if (state.gameOver || deltaSeconds <= 0) return

  const player = state.player
  const previousY = player.y
  player.velocityX = updateHorizontalVelocity(player.velocityX, input, deltaSeconds)
  player.velocityY = applyGravity(player.velocityY, deltaSeconds)
  player.x = wrapHorizontal(player.x + player.velocityX * deltaSeconds, player.width, viewport.width)
  player.y += player.velocityY * deltaSeconds

  for (const platform of state.platforms) {
    platform.impactAnimation = Math.max(0, platform.impactAnimation - deltaSeconds * 8)
  }

  const landing = findLandingPlatform(player, previousY, state.platforms)
  if (landing) {
    player.y = landing.y - player.height
    player.velocityY = bouncedVelocity()
    player.landingAnimation = 1
    landing.impactAnimation = 1
  } else {
    player.landingAnimation = Math.max(0, player.landingAnimation - deltaSeconds * 7)
  }

  const cameraThreshold = viewport.height * GAME_CONFIG.cameraThresholdRatio
  if (player.y < cameraThreshold && player.velocityY < 0) {
    const scrollDistance = (cameraThreshold - player.y) * GAME_CONFIG.cameraScrollSpeed
    player.y += scrollDistance
    for (const platform of state.platforms) platform.y += scrollDistance
    state.climbedPixels += scrollDistance
    state.score = Math.max(state.score, scoreFromClimbedPixels(state.climbedPixels))
  }

  state.platforms = state.platforms.filter((platform) => platform.y < viewport.height + GAME_CONFIG.removalMargin)
  replenishPlatforms(state, viewport, random)
  if (player.y > viewport.height + GAME_CONFIG.gameOverMargin) state.gameOver = true
}

export function replenishPlatforms(
  state: JumpGameState,
  viewport: JumpViewport,
  random: RandomSource = Math.random,
) {
  if (state.platforms.length === 0) return
  let top = state.platforms[0]
  for (const platform of state.platforms) if (platform.y < top.y) top = platform
  while (top.y > -GAME_CONFIG.generationMargin) {
    const previousX = top.x
    top = generateNextPlatform(top, viewport.width, state.nextPlatformId++, random, {
      progress: state.score / GAME_CONFIG.platformDifficultyFullScore,
      previousDirection: state.lastPlatformDirection,
      sameDirectionCount: state.sameDirectionPlatformCount,
    })
    const direction = Math.sign(top.x - previousX) as PlatformDirection
    if (direction === 0) {
      state.lastPlatformDirection = 0
      state.sameDirectionPlatformCount = 0
    } else if (direction === state.lastPlatformDirection) {
      state.sameDirectionPlatformCount += 1
    } else {
      state.lastPlatformDirection = direction
      state.sameDirectionPlatformCount = 1
    }
    state.platforms.push(top)
  }
}

function randomBetween(minimum: number, maximum: number, random: RandomSource) {
  return minimum + (maximum - minimum) * clamp(random(), 0, 1)
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

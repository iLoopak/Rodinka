import { GAME_CONFIG } from '../config/gameConfig'
import type {
  FallingClutter,
  FallingClutterKind,
  JumpGameState,
  JumpInput,
  JumpPlatform,
  JumpPlayer,
  JumpViewport,
  PlatformWidthVariant,
} from '../types/game'
import { environmentBlendAtHeight } from './environment'

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
  const widthVariant = platformWidthVariant(random())
  const platformWidth = GAME_CONFIG.platform.widths[widthVariant]
  const previousDirection = options.previousDirection ?? 0
  const forceTurn = previousDirection !== 0 && (options.sameDirectionCount ?? 0) >= 2
  let direction: PlatformDirection = random() < 0.5 ? -1 : 1
  if (forceTurn) direction = previousDirection === 1 ? -1 : 1
  const horizontalDistance = randomBetween(
    GAME_CONFIG.platformSpacing.minimumHorizontal,
    maximumHorizontal,
    random,
  )
  const maximumX = Math.max(0, viewportWidth - platformWidth)
  const previousCenter = previous.x + previous.width / 2
  let nextX = previousCenter + direction * horizontalDistance - platformWidth / 2
  if (nextX < 0 || nextX > maximumX) {
    direction = direction === 1 ? -1 : 1
    nextX = previousCenter + direction * horizontalDistance - platformWidth / 2
  }
  return {
    id,
    kind: 'stable',
    widthVariant,
    x: clamp(nextX, 0, maximumX),
    y: previous.y - verticalGap,
    width: platformWidth,
    height: GAME_CONFIG.platform.height,
    impactAnimation: 0,
  }
}

export function isReachablePlatformStep(lower: JumpPlatform, upper: JumpPlatform): boolean {
  const verticalGap = lower.y - upper.y
  const lowerCenter = lower.x + lower.width / 2
  const upperCenter = upper.x + upper.width / 2
  const horizontalGap = Math.abs(lowerCenter - upperCenter)
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
    widthVariant: 'medium',
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
    clutter: [],
    nextPlatformId: 2,
    nextClutterId: 1,
    clutterSpawnCooldown: GAME_CONFIG.clutter.initialCooldownSeconds,
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

  updateFallingClutter(state, deltaSeconds, viewport, random)
  if (findFallingClutterCollision(player, state.clutter)) {
    state.gameOver = true
    return
  }

  state.platforms = state.platforms.filter((platform) => platform.y < viewport.height + GAME_CONFIG.removalMargin)
  replenishPlatforms(state, viewport, random)
  if (player.y > viewport.height + GAME_CONFIG.gameOverMargin) state.gameOver = true
}

export function updateFallingClutter(
  state: JumpGameState,
  deltaSeconds: number,
  viewport: JumpViewport,
  random: RandomSource = Math.random,
) {
  if (state.score >= GAME_CONFIG.clutter.minimumScore) {
    state.clutterSpawnCooldown -= deltaSeconds
    if (state.clutterSpawnCooldown <= 0 && state.clutter.length < GAME_CONFIG.clutter.maximumOnScreen) {
      state.clutter.push(createFallingClutter(state.nextClutterId++, state.score, viewport.width, random))
      state.clutterSpawnCooldown = nextClutterCooldown(state.score, random)
    }
  }

  for (const item of state.clutter) {
    if (item.warningSeconds > 0) {
      item.warningSeconds = Math.max(0, item.warningSeconds - deltaSeconds)
      continue
    }
    item.x += item.velocityX * deltaSeconds
    item.y += item.velocityY * deltaSeconds
    item.rotation += item.rotationSpeed * deltaSeconds
    if (item.x < 0) {
      item.x = 0
      item.velocityX = Math.abs(item.velocityX)
    } else if (item.x + item.width > viewport.width) {
      item.x = Math.max(0, viewport.width - item.width)
      item.velocityX = -Math.abs(item.velocityX)
    }
  }

  state.clutter = state.clutter.filter((item) => item.y < viewport.height + GAME_CONFIG.clutter.removalMargin)
}

export function createFallingClutter(
  id: number,
  score: number,
  viewportWidth: number,
  random: RandomSource = Math.random,
): FallingClutter {
  const theme = environmentBlendAtHeight(score).current
  const kindIndex = Math.min(theme.clutterKinds.length - 1, Math.floor(clamp(random(), 0, 0.999_999) * theme.clutterKinds.length))
  const maximumX = Math.max(
    GAME_CONFIG.clutter.horizontalPadding,
    viewportWidth - GAME_CONFIG.clutter.width - GAME_CONFIG.clutter.horizontalPadding,
  )
  const direction = random() < 0.5 ? -1 : 1
  return {
    id,
    kind: theme.clutterKinds[kindIndex] as FallingClutterKind,
    x: randomBetween(GAME_CONFIG.clutter.horizontalPadding, maximumX, random),
    y: GAME_CONFIG.hudSafeHeight - GAME_CONFIG.clutter.height,
    width: GAME_CONFIG.clutter.width,
    height: GAME_CONFIG.clutter.height,
    velocityX: direction * randomBetween(8, GAME_CONFIG.clutter.maximumHorizontalDrift, random),
    velocityY: randomBetween(GAME_CONFIG.clutter.minimumFallSpeed, GAME_CONFIG.clutter.maximumFallSpeed, random),
    rotation: randomBetween(-Math.PI, Math.PI, random),
    rotationSpeed: randomBetween(-GAME_CONFIG.clutter.maximumRotationSpeed, GAME_CONFIG.clutter.maximumRotationSpeed, random),
    warningSeconds: GAME_CONFIG.clutter.warningSeconds,
  }
}

export function findFallingClutterCollision(
  player: JumpPlayer,
  clutter: readonly FallingClutter[],
): FallingClutter | null {
  const inset = GAME_CONFIG.clutter.collisionInset
  const playerLeft = player.x + inset
  const playerRight = player.x + player.width - inset
  const playerTop = player.y + inset
  const playerBottom = player.y + player.height - inset
  for (const item of clutter) {
    if (item.warningSeconds > 0) continue
    const overlaps = playerRight > item.x + inset
      && playerLeft < item.x + item.width - inset
      && playerBottom > item.y + inset
      && playerTop < item.y + item.height - inset
    if (overlaps) return item
  }
  return null
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
    const previousCenter = top.x + top.width / 2
    top = generateNextPlatform(top, viewport.width, state.nextPlatformId++, random, {
      progress: state.score / GAME_CONFIG.platformDifficultyFullScore,
      previousDirection: state.lastPlatformDirection,
      sameDirectionCount: state.sameDirectionPlatformCount,
    })
    const direction = Math.sign(top.x + top.width / 2 - previousCenter) as PlatformDirection
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

function platformWidthVariant(randomValue: number): PlatformWidthVariant {
  const value = clamp(randomValue, 0, 1)
  if (value < GAME_CONFIG.platform.widthThresholds.short) return 'short'
  if (value < GAME_CONFIG.platform.widthThresholds.medium) return 'medium'
  return 'long'
}

function nextClutterCooldown(score: number, random: RandomSource) {
  const progress = clamp(
    (score - GAME_CONFIG.clutter.minimumScore)
      / (GAME_CONFIG.clutter.fullDifficultyScore - GAME_CONFIG.clutter.minimumScore),
    0,
    1,
  )
  const maximum = interpolate(
    GAME_CONFIG.clutter.cooldownSeconds.maximum,
    GAME_CONFIG.clutter.cooldownSeconds.minimum,
    progress,
  )
  return randomBetween(GAME_CONFIG.clutter.cooldownSeconds.minimum, maximum, random)
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

export const FAMILY_JUMP_GAME_KEY = 'family_jump'

export const GAME_CONFIG = Object.freeze({
  gravity: 1_850,
  jumpVelocity: -720,
  horizontalAcceleration: 1_520,
  maximumHorizontalSpeed: 330,
  horizontalFriction: 7.2,
  maximumFallSpeed: 1_050,
  cameraScrollSpeed: 1,
  cameraThresholdRatio: 0.42,
  platformSpacing: Object.freeze({
    minimumVertical: 64,
    maximumVertical: 104,
    maximumHorizontal: 132,
  }),
  platform: Object.freeze({ width: 86, height: 14 }),
  player: Object.freeze({ width: 38, height: 44 }),
  metersPerPixel: 0.5,
  maximumDeltaSeconds: 1 / 30,
  physicsStepSeconds: 1 / 120,
  generationMargin: 130,
  removalMargin: 110,
  gameOverMargin: 72,
})

export type FamilyJumpGameConfig = typeof GAME_CONFIG

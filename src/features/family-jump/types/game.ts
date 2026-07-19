export interface JumpInput {
  left: boolean
  right: boolean
}

export interface JumpPlayer {
  x: number
  y: number
  width: number
  height: number
  velocityX: number
  velocityY: number
  landingAnimation: number
}

export interface StablePlatform {
  id: number
  kind: 'stable'
  x: number
  y: number
  width: number
  height: number
}

export type JumpPlatform = StablePlatform

export interface JumpGameState {
  player: JumpPlayer
  platforms: JumpPlatform[]
  nextPlatformId: number
  climbedPixels: number
  score: number
  gameOver: boolean
}

export interface JumpViewport {
  width: number
  height: number
}

export interface JumpScoreMarker {
  memberId: string
  name: string
  score: number
  color: string
}

export interface JumpDebugSnapshot {
  fps: number
  velocityY: number
  score: number
  platformCount: number
}

import { GAME_CONFIG } from '../config/gameConfig'
import type { JumpDebugSnapshot, JumpGameState, JumpInput, JumpPlatform, JumpScoreMarker, JumpViewport } from '../types/game'
import { createInitialGameState, stepGame } from './core'

interface EngineCopy {
  marker: (name: string, score: number) => string
  overtookMember: (name: string) => string
  familyRecord: string
}

interface FamilyJumpEngineOptions {
  canvas: HTMLCanvasElement
  color: string
  markers: JumpScoreMarker[]
  copy: EngineCopy
  reducedMotion: boolean
  familyRecord: number
  onScore: (score: number) => void
  onPauseChange: (paused: boolean) => void
  onAnnouncement: (message: string) => void
  onDebug: (snapshot: JumpDebugSnapshot) => void
  onGameOver: (score: number) => void
}

export class FamilyJumpEngine {
  private readonly options: FamilyJumpEngineOptions
  private readonly context: CanvasRenderingContext2D
  private readonly input: JumpInput = { left: false, right: false }
  private readonly beatenMarkers = new Set<string>()
  private readonly resizeObserver: ResizeObserver | null
  private viewport: JumpViewport = { width: 320, height: 560 }
  private state: JumpGameState | null = null
  private frameId: number | null = null
  private previousTimestamp: number | null = null
  private paused = false
  private destroyed = false
  private finished = false
  private debug = false
  private toast = ''
  private toastSeconds = 0
  private lastReportedScore = -1
  private lastScoreReport = 0
  private lastDebugReport = 0
  private fps = 60
  private fpsFrames = 0
  private fpsWindowStarted = 0
  private readonly familyRecord: number

  constructor(options: FamilyJumpEngineOptions) {
    this.options = options
    const context = options.canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is unavailable')
    this.context = context
    this.familyRecord = Math.max(0, options.familyRecord)
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this.resize())
  }

  start() {
    this.resize()
    this.state = createInitialGameState(this.viewport)
    this.resizeObserver?.observe(this.options.canvas)
    window.addEventListener('keydown', this.onKeyDown, { passive: false })
    window.addEventListener('keyup', this.onKeyUp, { passive: false })
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.scheduleFrame()
  }

  destroy() {
    this.destroyed = true
    if (this.frameId !== null) cancelAnimationFrame(this.frameId)
    this.frameId = null
    this.resizeObserver?.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }

  setControl(side: 'left' | 'right', active: boolean) {
    if (active && (this.paused || this.finished || this.destroyed)) return
    this.input[side] = active
  }

  setDebug(enabled: boolean) {
    this.debug = enabled
    this.render()
  }

  togglePause() {
    this.setPaused(!this.paused)
  }

  finishNow() {
    this.finish()
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (isLeftKey(event.key)) {
      event.preventDefault()
      this.input.left = true
    } else if (isRightKey(event.key)) {
      event.preventDefault()
      this.input.right = true
    } else if (event.key.toLowerCase() === 'p' && !event.repeat) {
      event.preventDefault()
      this.togglePause()
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (isLeftKey(event.key)) {
      event.preventDefault()
      this.input.left = false
    } else if (isRightKey(event.key)) {
      event.preventDefault()
      this.input.right = false
    }
  }

  private readonly onVisibilityChange = () => {
    if (document.hidden) this.setPaused(true)
  }

  private setPaused(paused: boolean) {
    if (this.finished || this.paused === paused) return
    this.paused = paused
    this.input.left = false
    this.input.right = false
    this.previousTimestamp = null
    this.options.onPauseChange(paused)
    if (paused) {
      if (this.frameId !== null) cancelAnimationFrame(this.frameId)
      this.frameId = null
      this.render()
    } else {
      this.scheduleFrame()
    }
  }

  private scheduleFrame() {
    if (this.destroyed || this.finished || this.paused || this.frameId !== null) return
    this.frameId = requestAnimationFrame(this.onFrame)
  }

  private readonly onFrame = (timestamp: number) => {
    this.frameId = null
    if (this.destroyed || this.finished || this.paused || !this.state) return
    if (this.previousTimestamp === null) this.previousTimestamp = timestamp
    const deltaSeconds = Math.min(
      GAME_CONFIG.maximumDeltaSeconds,
      Math.max(0, (timestamp - this.previousTimestamp) / 1_000),
    )
    this.previousTimestamp = timestamp
    const previousScore = this.state.score
    let remaining = deltaSeconds
    while (remaining > 0 && !this.state.gameOver) {
      const step = Math.min(GAME_CONFIG.physicsStepSeconds, remaining)
      stepGame(this.state, this.input, step, this.viewport)
      remaining -= step
    }
    this.toastSeconds = Math.max(0, this.toastSeconds - deltaSeconds)
    this.updateMilestones(previousScore, this.state.score)
    this.reportState(timestamp)
    this.render()
    if (this.state.gameOver) this.finish()
    else this.scheduleFrame()
  }

  private reportState(timestamp: number) {
    if (!this.state) return
    this.fpsFrames += 1
    if (!this.fpsWindowStarted) this.fpsWindowStarted = timestamp
    if (timestamp - this.fpsWindowStarted >= 500) {
      this.fps = Math.round(this.fpsFrames * 1_000 / (timestamp - this.fpsWindowStarted))
      this.fpsFrames = 0
      this.fpsWindowStarted = timestamp
    }
    if (this.state.score !== this.lastReportedScore && timestamp - this.lastScoreReport >= 120) {
      this.lastReportedScore = this.state.score
      this.lastScoreReport = timestamp
      this.options.onScore(this.state.score)
    }
    if (this.debug && timestamp - this.lastDebugReport >= 180) {
      this.lastDebugReport = timestamp
      this.options.onDebug({
        fps: this.fps,
        velocityY: Math.round(this.state.player.velocityY),
        score: this.state.score,
        platformCount: this.state.platforms.length,
      })
    }
  }

  private updateMilestones(previousScore: number, score: number) {
    for (const marker of this.options.markers) {
      if (marker.score <= 0 || this.beatenMarkers.has(marker.memberId)) continue
      if (previousScore <= marker.score && score > marker.score) {
        this.beatenMarkers.add(marker.memberId)
        this.showToast(this.options.copy.overtookMember(marker.name))
      }
    }
    if (previousScore <= this.familyRecord && score > this.familyRecord) {
      this.showToast(this.options.copy.familyRecord)
    }
  }

  private showToast(message: string) {
    this.toast = message
    this.toastSeconds = 2.2
    this.options.onAnnouncement(message)
  }

  private finish() {
    if (this.finished) return
    this.finished = true
    if (this.frameId !== null) cancelAnimationFrame(this.frameId)
    this.frameId = null
    this.options.onGameOver(this.state?.score ?? 0)
  }

  private resize() {
    const rect = this.options.canvas.getBoundingClientRect()
    const width = Math.max(240, Math.round(rect.width || this.options.canvas.parentElement?.clientWidth || 320))
    const height = Math.max(360, Math.round(rect.height || this.options.canvas.parentElement?.clientHeight || 560))
    const previousHeight = this.viewport.height
    this.viewport = { width, height }
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
    this.options.canvas.width = Math.round(width * dpr)
    this.options.canvas.height = Math.round(height * dpr)
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (this.state && previousHeight !== height) {
      const shift = height - previousHeight
      this.state.player.y += shift
      for (const platform of this.state.platforms) platform.y += shift
    }
    this.render()
  }

  private render() {
    const state = this.state
    if (!state) return
    const context = this.context
    const { width, height } = this.viewport
    context.clearRect(0, 0, width, height)
    const background = context.createLinearGradient(0, 0, 0, height)
    background.addColorStop(0, '#EAF3EE')
    background.addColorStop(0.55, '#F7F2E8')
    background.addColorStop(1, '#FFF8EF')
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
    this.drawBackground(context, state)
    this.drawMarkers(context, state)
    this.drawPlatforms(context, state)
    this.drawPlayer(context, state)
    if (this.toastSeconds > 0) this.drawToast(context, this.toast)
    if (this.debug) this.drawDebug(context, state)
  }

  private drawBackground(context: CanvasRenderingContext2D, state: JumpGameState) {
    const { width, height } = this.viewport
    context.save()
    context.fillStyle = 'rgba(255,255,255,.2)'
    const drift = this.options.reducedMotion ? 0 : state.climbedPixels * 0.025
    for (let index = 0; index < 8; index += 1) {
      const x = (index * 113 + 31) % width
      const y = ((index * 163 + drift) % (height + 100)) - 50
      context.beginPath()
      context.arc(x, y, 8 + index % 3 * 4, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  private drawMarkers(context: CanvasRenderingContext2D, state: JumpGameState) {
    const threshold = this.viewport.height * GAME_CONFIG.cameraThresholdRatio
    for (const marker of this.options.markers) {
      if (marker.score <= 0) continue
      const y = threshold - (marker.score - state.score) / GAME_CONFIG.metersPerPixel
      if (y < GAME_CONFIG.hudSafeHeight + 28 || y > this.viewport.height + 30) continue
      const beaten = this.beatenMarkers.has(marker.memberId)
      context.save()
      context.globalAlpha = beaten ? 0.52 : 0.9
      context.strokeStyle = marker.color
      context.lineWidth = beaten ? 3 : 2
      context.setLineDash(beaten ? [] : [6, 6])
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(this.viewport.width, y)
      context.stroke()
      context.setLineDash([])
      context.font = '700 12px Manrope, sans-serif'
      const label = this.options.copy.marker(marker.name, marker.score)
      const labelWidth = Math.min(this.viewport.width - 24, context.measureText(label).width + 18)
      const labelPosition = this.markerLabelPosition(state, y, labelWidth)
      roundedRect(context, labelPosition.x, labelPosition.y, labelWidth, 24, 12)
      context.fillStyle = marker.color
      context.fill()
      context.fillStyle = marker.foreground
      context.fillText(label, labelPosition.x + 9, labelPosition.y + 17, labelWidth - 18)
      context.restore()
    }
  }

  private markerLabelPosition(state: JumpGameState, markerY: number, labelWidth: number) {
    const left = 12
    const right = Math.max(12, this.viewport.width - labelWidth - 12)
    const candidates = [
      { x: left, y: markerY - 29 },
      { x: right, y: markerY - 29 },
      { x: left, y: markerY + 5 },
      { x: right, y: markerY + 5 },
    ]
    const overlapsPlatform = ({ x, y }: { x: number; y: number }) => state.platforms.some((platform) =>
      platform.x < x + labelWidth
      && platform.x + platform.width > x
      && platform.y < y + 24
      && platform.y + platform.height > y)
    return candidates.find((candidate) => !overlapsPlatform(candidate)) ?? candidates[0]
  }

  private drawPlatforms(context: CanvasRenderingContext2D, state: JumpGameState) {
    context.save()
    for (const platform of state.platforms) {
      if (platform.y < -30 || platform.y > this.viewport.height + 30) continue
      const impact = this.options.reducedMotion ? 0 : platform.impactAnimation
      const drawWidth = platform.width * (1 + impact * 0.04)
      const drawHeight = platform.height * (1 - impact * 0.12)
      const drawX = platform.x - (drawWidth - platform.width) / 2
      const drawY = platform.y + impact * 2.5
      context.fillStyle = 'rgba(58, 70, 61, .12)'
      roundedRect(context, drawX + 2, drawY + 6, drawWidth, drawHeight, 8)
      context.fill()
      context.fillStyle = '#FFFFFF'
      roundedRect(context, drawX, drawY, drawWidth, drawHeight, 8)
      context.fill()
      context.strokeStyle = 'rgba(79, 128, 104, .46)'
      context.lineWidth = 2
      context.stroke()
      context.strokeStyle = 'rgba(79, 128, 104, .72)'
      context.lineWidth = 2.5
      context.lineCap = 'round'
      context.beginPath()
      context.moveTo(drawX + 9, drawY + 3)
      context.lineTo(drawX + drawWidth - 9, drawY + 3)
      context.stroke()
      if (this.debug) {
        context.strokeStyle = '#9C3E3E'
        context.lineWidth = 1
        context.strokeRect(platform.x, platform.y, platform.width, platform.height)
      }
    }
    context.restore()
  }

  private drawPlayer(context: CanvasRenderingContext2D, state: JumpGameState) {
    const player = state.player
    const centerX = player.x + player.width / 2
    const centerY = player.y + player.height / 2
    const motionScale = this.options.reducedMotion ? 0 : 1
    const squash = player.landingAnimation * 0.13 * motionScale
    const stretch = player.velocityY < -400 ? 0.07 * motionScale : 0
    const scaleX = 1 + squash - stretch * 0.4
    const scaleY = 1 - squash + stretch
    const tilt = motionScale * Math.max(-0.18, Math.min(0.18, player.velocityX / 1_700))
    const playerBottom = player.y + player.height
    let supportingPlatform: JumpPlatform | undefined
    for (const platform of state.platforms) {
      const belowPlayer = platform.y >= playerBottom - 1
      const horizontallyNear = platform.x < player.x + player.width + 18
        && platform.x + platform.width > player.x - 18
      if (belowPlayer && horizontallyNear && (!supportingPlatform || platform.y < supportingPlatform.y)) {
        supportingPlatform = platform
      }
    }
    const shadowDistance = Math.min(180, Math.max(0, (supportingPlatform?.y ?? playerBottom + 180) - playerBottom))
    const shadowHeight = shadowDistance / 180
    const shadowRadiusX = player.width * (0.42 - shadowHeight * 0.18)
    const shadowOpacity = 0.18 - shadowHeight * 0.11

    context.save()
    context.fillStyle = `rgba(36,49,40,${shadowOpacity})`
    context.beginPath()
    context.ellipse(
      centerX,
      supportingPlatform ? supportingPlatform.y + 3 : playerBottom + 10,
      shadowRadiusX,
      Math.max(2.5, shadowRadiusX * 0.28),
      0,
      0,
      Math.PI * 2,
    )
    context.fill()
    context.translate(centerX, centerY)
    context.rotate(tilt)
    context.scale(scaleX, scaleY)
    context.fillStyle = this.options.color
    roundedRect(context, -player.width / 2, -player.height / 2, player.width, player.height, 17)
    context.fill()
    context.fillStyle = '#243128'
    context.beginPath()
    context.arc(-7, -7, 2.2, 0, Math.PI * 2)
    context.arc(7, -7, 2.2, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#243128'
    context.lineWidth = 2
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(-4, 3)
    context.quadraticCurveTo(0, 6, 4, 3)
    context.stroke()
    context.beginPath()
    context.moveTo(-9, player.height / 2 - 1)
    context.lineTo(-10, player.height / 2 + 7)
    context.moveTo(9, player.height / 2 - 1)
    context.lineTo(10, player.height / 2 + 7)
    context.stroke()
    if (this.debug) {
      context.strokeStyle = '#9C3E3E'
      context.lineWidth = 1
      context.strokeRect(-player.width / 2, -player.height / 2, player.width, player.height)
    }
    context.restore()
  }

  private drawToast(context: CanvasRenderingContext2D, message: string) {
    context.save()
    context.font = '800 14px Manrope, sans-serif'
    const width = Math.min(this.viewport.width - 32, context.measureText(message).width + 30)
    const x = (this.viewport.width - width) / 2
    const y = GAME_CONFIG.hudSafeHeight + 8
    roundedRect(context, x, y, width, 42, 20)
    context.fillStyle = 'rgba(255,253,248,.96)'
    context.fill()
    context.strokeStyle = 'rgba(169,71,56,.25)'
    context.stroke()
    context.fillStyle = '#243128'
    context.textAlign = 'center'
    context.fillText(message, this.viewport.width / 2, y + 26)
    context.restore()
  }

  private drawDebug(context: CanvasRenderingContext2D, state: JumpGameState) {
    context.save()
    context.font = '600 11px ui-monospace, monospace'
    context.fillStyle = 'rgba(36,49,40,.82)'
    roundedRect(context, 10, this.viewport.height - 84, 142, 72, 10)
    context.fill()
    context.fillStyle = '#FFFFFF'
    context.fillText(`FPS ${this.fps}`, 20, this.viewport.height - 64)
    context.fillText(`vy ${Math.round(state.player.velocityY)}`, 20, this.viewport.height - 48)
    context.fillText(`height ${state.score}m`, 20, this.viewport.height - 32)
    context.fillText(`platforms ${state.platforms.length}`, 20, this.viewport.height - 16)
    context.restore()
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function isLeftKey(key: string) {
  return key === 'ArrowLeft' || key.toLowerCase() === 'a'
}

function isRightKey(key: string) {
  return key === 'ArrowRight' || key.toLowerCase() === 'd'
}

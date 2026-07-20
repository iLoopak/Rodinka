import { GAME_CONFIG } from '../config/gameConfig'
import type { FallingClutter, JumpDebugSnapshot, JumpGameState, JumpInput, JumpPlatform, JumpScoreMarker, JumpViewport } from '../types/game'
import { createInitialGameState, stepGame } from './core'
import { environmentBlendAtHeight, type EnvironmentTheme } from './environment'

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
        clutterCount: this.state.clutter.length,
        environment: visibleEnvironment(this.state.score).id,
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
    if (this.state) {
      const shift = height - previousHeight
      if (shift !== 0) this.state.player.y += shift
      for (const platform of this.state.platforms) {
        platform.x = Math.min(platform.x, Math.max(0, width - platform.width))
        if (shift !== 0) platform.y += shift
      }
      for (const item of this.state.clutter) {
        item.x = Math.min(item.x, Math.max(0, width - item.width))
        if (shift !== 0) item.y += shift
      }
    }
    this.render()
  }

  private render() {
    const state = this.state
    if (!state) return
    const context = this.context
    const { width, height } = this.viewport
    context.clearRect(0, 0, width, height)
    this.drawBackground(context, state)
    this.drawMarkers(context, state)
    this.drawPlatforms(context, state)
    this.drawClutter(context, state)
    this.drawPlayer(context, state)
    if (this.toastSeconds > 0) this.drawToast(context, this.toast)
    if (this.debug) this.drawDebug(context, state)
  }

  private drawBackground(context: CanvasRenderingContext2D, state: JumpGameState) {
    const blend = environmentBlendAtHeight(state.score)
    this.drawEnvironmentLayer(context, state, blend.current, 1)
    if (blend.progress > 0) this.drawEnvironmentLayer(context, state, blend.next, blend.progress)
  }

  private drawEnvironmentLayer(
    context: CanvasRenderingContext2D,
    state: JumpGameState,
    theme: EnvironmentTheme,
    alpha: number,
  ) {
    if (alpha <= 0) return
    const { width, height } = this.viewport
    context.save()
    context.globalAlpha = alpha
    const background = context.createLinearGradient(0, 0, 0, height)
    background.addColorStop(0, theme.background[0])
    background.addColorStop(0.55, theme.background[1])
    background.addColorStop(1, theme.background[2])
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
    const drift = this.options.reducedMotion ? 0 : state.climbedPixels * GAME_CONFIG.environment.decorativeDrift
    drawEnvironmentDecorations(context, theme, width, height, drift)
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
      if (platform.widthVariant === 'long') {
        context.fillStyle = 'rgba(79, 128, 104, .28)'
        context.beginPath()
        context.arc(drawX + 16, drawY + drawHeight / 2 + 1, 1.8, 0, Math.PI * 2)
        context.arc(drawX + drawWidth - 16, drawY + drawHeight / 2 + 1, 1.8, 0, Math.PI * 2)
        context.fill()
      } else if (platform.widthVariant === 'short') {
        context.fillStyle = 'rgba(79, 128, 104, .22)'
        context.beginPath()
        context.arc(drawX + drawWidth / 2, drawY + drawHeight / 2 + 1, 2, 0, Math.PI * 2)
        context.fill()
      }
      if (this.debug) {
        context.strokeStyle = '#9C3E3E'
        context.lineWidth = 1
        context.strokeRect(platform.x, platform.y, platform.width, platform.height)
      }
    }
    context.restore()
  }

  private drawClutter(context: CanvasRenderingContext2D, state: JumpGameState) {
    for (const item of state.clutter) {
      if (item.warningSeconds > 0) {
        const motionPulse = this.options.reducedMotion ? 0 : Math.sin(item.warningSeconds * 22) * 0.12
        context.save()
        context.globalAlpha = 0.72 + motionPulse
        context.fillStyle = '#A94738'
        context.beginPath()
        context.arc(item.x + item.width / 2, GAME_CONFIG.hudSafeHeight + 9, 5.5, 0, Math.PI * 2)
        context.fill()
        context.strokeStyle = 'rgba(169, 71, 56, .34)'
        context.lineWidth = 2
        context.beginPath()
        context.arc(item.x + item.width / 2, GAME_CONFIG.hudSafeHeight + 9, 10, 0, Math.PI * 2)
        context.stroke()
        context.restore()
        continue
      }

      context.save()
      context.translate(item.x + item.width / 2, item.y + item.height / 2)
      context.rotate(item.rotation)
      context.fillStyle = 'rgba(36, 49, 40, .14)'
      context.beginPath()
      context.ellipse(2, item.height / 2 + 4, item.width * 0.38, 4, 0, 0, Math.PI * 2)
      context.fill()
      drawClutterShape(context, item)
      if (this.debug) {
        context.strokeStyle = '#9C3E3E'
        context.lineWidth = 1
        context.strokeRect(-item.width / 2, -item.height / 2, item.width, item.height)
      }
      context.restore()
    }
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
    const environment = visibleEnvironment(state.score)
    context.save()
    context.font = '600 11px ui-monospace, monospace'
    context.fillStyle = 'rgba(36,49,40,.82)'
    roundedRect(context, 10, this.viewport.height - 116, 166, 104, 10)
    context.fill()
    context.fillStyle = '#FFFFFF'
    context.fillText(`FPS ${this.fps}`, 20, this.viewport.height - 96)
    context.fillText(`vy ${Math.round(state.player.velocityY)}`, 20, this.viewport.height - 80)
    context.fillText(`height ${state.score}m`, 20, this.viewport.height - 64)
    context.fillText(`platforms ${state.platforms.length}`, 20, this.viewport.height - 48)
    context.fillText(`clutter ${state.clutter.length}`, 20, this.viewport.height - 32)
    context.fillText(`theme ${environment.id}`, 20, this.viewport.height - 16)
    context.restore()
  }
}

function visibleEnvironment(score: number) {
  const blend = environmentBlendAtHeight(score)
  return blend.progress < 0.5 ? blend.current : blend.next
}

function drawEnvironmentDecorations(
  context: CanvasRenderingContext2D,
  theme: EnvironmentTheme,
  width: number,
  height: number,
  drift: number,
) {
  const y = (base: number) => ((base + drift) % (height + 160)) - 80
  context.lineWidth = 2
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (theme.decoration === 'toys') {
    for (let index = 0; index < 7; index += 1) {
      const x = (index * 97 + 28) % width
      const top = y(index * 121 + 34)
      context.strokeStyle = index % 2 ? theme.decorationColor : theme.secondaryDecorationColor
      if (index % 2) {
        roundedRect(context, x - 10, top - 10, 20, 20, 5)
        context.stroke()
      } else {
        context.beginPath()
        context.arc(x, top, 8 + index % 3 * 2, 0, Math.PI * 2)
        context.stroke()
      }
    }
    return
  }

  if (theme.decoration === 'kitchen') {
    context.strokeStyle = theme.decorationColor
    context.lineWidth = 1
    for (let x = 28; x < width; x += 72) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    }
    for (let row = 0; row < 6; row += 1) {
      const top = y(row * 118 + 20)
      context.beginPath()
      context.moveTo(0, top)
      context.lineTo(width, top)
      context.stroke()
      context.strokeStyle = theme.secondaryDecorationColor
      context.beginPath()
      context.arc((row * 109 + 52) % width, top - 20, 12, 0, Math.PI * 2)
      context.stroke()
      context.strokeStyle = theme.decorationColor
    }
    return
  }

  if (theme.decoration === 'bubbles') {
    for (let index = 0; index < 10; index += 1) {
      context.strokeStyle = index % 3 ? theme.decorationColor : theme.secondaryDecorationColor
      context.beginPath()
      context.arc(
        (index * 83 + 31) % width,
        y(index * 79 + 18),
        6 + index % 4 * 4,
        0,
        Math.PI * 2,
      )
      context.stroke()
    }
    return
  }

  if (theme.decoration === 'study') {
    context.strokeStyle = theme.decorationColor
    context.lineWidth = 1
    for (let row = 0; row < 8; row += 1) {
      const top = y(row * 86 + 26)
      context.beginPath()
      context.moveTo(20, top)
      context.lineTo(width - 20, top)
      context.stroke()
    }
    context.lineWidth = 2
    for (let index = 0; index < 5; index += 1) {
      context.strokeStyle = index % 2 ? theme.decorationColor : theme.secondaryDecorationColor
      roundedRect(context, (index * 107 + 22) % width, y(index * 147 + 60), 24, 31, 4)
      context.stroke()
    }
    return
  }

  for (let index = 0; index < 9; index += 1) {
    const x = (index * 91 + 24) % width
    const top = y(index * 103 + 18)
    context.strokeStyle = index % 3 ? theme.decorationColor : theme.secondaryDecorationColor
    context.beginPath()
    context.ellipse(x, top, 5 + index % 2 * 3, 11, index % 2 ? 0.6 : -0.6, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.moveTo(x, top + 9)
    context.lineTo(x + (index % 2 ? -5 : 5), top + 16)
    context.stroke()
  }
}

function drawClutterShape(context: CanvasRenderingContext2D, item: FallingClutter) {
  const halfWidth = item.width / 2
  const halfHeight = item.height / 2
  context.lineWidth = 2
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#52635A'

  if (item.kind === 'ball') {
    context.fillStyle = '#D9A88F'
    context.beginPath()
    context.arc(0, 0, halfWidth - 3, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.beginPath()
    context.arc(-3, 0, halfWidth - 7, -1.1, 1.1)
    context.stroke()
    return
  }

  if (item.kind === 'block') {
    context.fillStyle = '#E3C67A'
    roundedRect(context, -halfWidth + 3, -halfHeight + 3, item.width - 6, item.height - 6, 5)
    context.fill()
    context.stroke()
    context.beginPath()
    context.moveTo(-5, 5)
    context.lineTo(0, -5)
    context.lineTo(5, 5)
    context.closePath()
    context.stroke()
    return
  }

  if (item.kind === 'leaf') {
    context.fillStyle = '#A8C8A8'
    context.beginPath()
    context.ellipse(0, 0, halfWidth - 4, halfHeight - 7, 0.65, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.beginPath()
    context.moveTo(-7, 8)
    context.lineTo(7, -8)
    context.stroke()
    return
  }

  if (item.kind === 'paper') {
    context.fillStyle = '#FFFDF8'
    roundedRect(context, -halfWidth + 4, -halfHeight + 2, item.width - 8, item.height - 4, 3)
    context.fill()
    context.stroke()
    context.strokeStyle = 'rgba(82, 99, 90, .48)'
    context.beginPath()
    context.moveTo(-7, -4)
    context.lineTo(7, -4)
    context.moveTo(-7, 2)
    context.lineTo(4, 2)
    context.stroke()
    return
  }

  if (item.kind === 'sock') {
    context.fillStyle = '#B8C9DC'
    context.beginPath()
    context.moveTo(-7, -halfHeight + 3)
    context.lineTo(7, -halfHeight + 3)
    context.lineTo(6, 4)
    context.quadraticCurveTo(11, 7, 10, 11)
    context.quadraticCurveTo(7, halfHeight - 2, 0, halfHeight - 3)
    context.lineTo(-8, halfHeight - 5)
    context.quadraticCurveTo(-11, halfHeight - 9, -6, 5)
    context.closePath()
    context.fill()
    context.stroke()
    return
  }

  context.fillStyle = '#D7D2C7'
  context.beginPath()
  context.ellipse(0, -7, 7, 9, 0, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.beginPath()
  context.moveTo(0, 1)
  context.lineTo(0, halfHeight - 2)
  context.stroke()
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

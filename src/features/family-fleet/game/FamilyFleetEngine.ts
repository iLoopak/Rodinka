import { createFleetState, resultFromState, resizeState, updateFleet, type FleetState, type PowerType } from './core'
import { SeededRng, type Rng } from './rng'
import { renderFleet } from './rendering'
import { DEFAULT_LOADOUT, type FleetLoadout } from '../cosmetics'
import { POWERUPS } from './powerups'
import { FleetSfx } from './sfx'

export interface ActivePower { type: PowerType; remaining: number; duration: number; icon: string; color: string }
export interface FleetSnapshot { score: number; level: number; energy: number; stars: number; powers: ActivePower[]; entityCount: number }
export interface FleetEngineOptions { accent: string; reducedMotion?: boolean; muted?: boolean; loadout?: FleetLoadout; onSnapshot?: (s: FleetSnapshot) => void; onGameOver: (r: ReturnType<typeof resultFromState>) => void; rng?: Rng }

export class FamilyFleetEngine {
  state: FleetState
  private raf = 0
  private last = 0
  private ctx: CanvasRenderingContext2D
  private rng: Rng
  private sfx: FleetSfx
  private over = false
  private lastImpactId = 0
  private lastPickupId = 0
  private lastVolleysFired = 0
  private canvas: HTMLCanvasElement
  private opts: FleetEngineOptions

  constructor(canvas: HTMLCanvasElement, opts: FleetEngineOptions) {
    this.canvas = canvas
    this.opts = opts
    this.ctx = canvas.getContext('2d')!
    this.rng = opts.rng ?? new SeededRng(Date.now())
    this.sfx = new FleetSfx(opts.muted)
    this.state = createFleetState()
    this.resize()
  }

  private playEventSounds() {
    const s = this.state
    if (s.volleysFired !== this.lastVolleysFired) { this.lastVolleysFired = s.volleysFired; this.sfx.shoot() }
    for (const impact of s.impacts) {
      if (impact.id <= this.lastImpactId) continue
      this.lastImpactId = Math.max(this.lastImpactId, impact.id)
      if (impact.kind === 'playerHit') this.sfx.hit()
      else this.sfx.explosion(impact.big)
    }
    for (const pickup of s.pickups) {
      if (pickup.id <= this.lastPickupId) continue
      this.lastPickupId = Math.max(this.lastPickupId, pickup.id)
      this.sfx.pickup(pickup.type)
    }
  }

  private snapshot(): FleetSnapshot {
    const p = this.state.player
    const powers: ActivePower[] = []
    for (const def of POWERUPS) {
      const remaining = p.powers[def.id]
      if (remaining > 0) powers.push({ type: def.id, remaining, duration: def.duration, icon: def.icon, color: def.color })
    }
    return { score: this.state.score, level: this.state.level, energy: p.energy, stars: this.state.stars, powers, entityCount: this.state.entities.length }
  }

  start() {
    this.last = performance.now()
    const loop = (now: number) => {
      const dt = (now - this.last) / 1000
      this.last = now
      updateFleet(this.state, dt, this.rng)
      renderFleet(this.ctx, this.state, this.opts.accent, this.opts.reducedMotion, this.opts.loadout ?? DEFAULT_LOADOUT)
      this.playEventSounds()
      this.opts.onSnapshot?.(this.snapshot())
      if (this.state.over && !this.over) {
        this.over = true
        this.sfx.gameOver()
        this.opts.onGameOver(resultFromState(this.state))
        return
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() { cancelAnimationFrame(this.raf); this.sfx.dispose() }
  pause() { this.state.paused = true }
  resume() { this.state.paused = false; this.last = performance.now() }
  setTargetX(x: number) { this.state.player.targetX = x }
  move(delta: number) { this.state.player.targetX += delta }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(320, Math.floor(rect.width || 390))
    const h = Math.max(520, Math.floor(rect.height || 720))
    this.canvas.width = Math.floor(w * dpr)
    this.canvas.height = Math.floor(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    resizeState(this.state, w, h)
  }
}

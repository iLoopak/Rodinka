import { createFleetState, resultFromState, resizeState, updateFleet, type FleetState } from './core'
import { SeededRng, type Rng } from './rng'
import { renderFleet } from './rendering'
import { DEFAULT_LOADOUT, type FleetLoadout } from '../cosmetics'
export interface FleetSnapshot { score: number; level: number; energy: number; stars: number; power: string; entityCount: number }
export interface FleetEngineOptions { accent: string; reducedMotion?: boolean; loadout?: FleetLoadout; onSnapshot?: (s: FleetSnapshot) => void; onGameOver: (r: ReturnType<typeof resultFromState>) => void; rng?: Rng }
export class FamilyFleetEngine {
  state: FleetState
  private raf = 0
  private last = 0
  private ctx: CanvasRenderingContext2D
  private rng: Rng
  private over = false
  private canvas: HTMLCanvasElement
  private opts: FleetEngineOptions
  constructor(canvas: HTMLCanvasElement, opts: FleetEngineOptions) { this.canvas = canvas; this.opts = opts; this.ctx = canvas.getContext('2d')!; this.rng = opts.rng ?? new SeededRng(Date.now()); this.state = createFleetState(); this.resize() }
  start() { this.last = performance.now(); const loop = (now: number) => { const dt = (now - this.last) / 1000; this.last = now; updateFleet(this.state, dt, this.rng); renderFleet(this.ctx, this.state, this.opts.accent, this.opts.reducedMotion, this.opts.loadout ?? DEFAULT_LOADOUT); this.opts.onSnapshot?.({ score: this.state.score, level: this.state.level, energy: this.state.player.energy, stars: this.state.stars, power: this.state.player.shield > 0 ? 'shield' : this.state.player.twin > 0 ? 'twin' : this.state.player.magnet > 0 ? 'magnet' : '', entityCount: this.state.entities.length }); if (this.state.over && !this.over) { this.over = true; this.opts.onGameOver(resultFromState(this.state)); return } this.raf = requestAnimationFrame(loop) }; this.raf = requestAnimationFrame(loop) }
  stop() { cancelAnimationFrame(this.raf) }
  pause() { this.state.paused = true }
  resume() { this.state.paused = false; this.last = performance.now() }
  setTargetX(x: number) { this.state.player.targetX = x }
  move(delta: number) { this.state.player.targetX += delta }
  resize() { const rect = this.canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = Math.max(320, Math.floor(rect.width || 390)); const h = Math.max(520, Math.floor(rect.height || 720)); this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); resizeState(this.state, w, h) }
}

import { powerupDefinition } from './powerups'
import type { PowerType } from './core'

// No audio assets in this codebase — every cue here is a short synthesized
// tone so the feature needs no binary files. The AudioContext is created
// lazily on the first call (inside a user gesture, e.g. the first tap to
// steer) to satisfy autoplay policies; if WebAudio isn't available (older
// browser, test environment) every method is a silent no-op.
export class FleetSfx {
  private ctx: AudioContext | null = null
  private muted: boolean

  constructor(muted = false) { this.muted = muted }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      try { this.ctx = new Ctor() } catch { return null }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = .08) {
    const ctx = this.ensureContext()
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      g.gain.setValueAtTime(gain, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration)
      osc.connect(g); g.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + duration)
    } catch { /* audio is best-effort feedback, never worth crashing the run over */ }
  }

  shoot() { this.tone(880, .05, 'square', .03) }

  hit() { this.tone(180, .1, 'sawtooth', .05) }

  explosion(big = false) { this.tone(big ? 90 : 140, big ? .35 : .18, 'triangle', big ? .12 : .07) }

  pickup(type: PowerType) {
    const def = powerupDefinition(type)
    this.tone(def.tone, .16, 'sine', .07)
    setTimeout(() => this.tone(def.tone * 1.5, .12, 'sine', .05), 60)
  }

  gameOver() {
    this.tone(300, .5, 'sawtooth', .07)
    setTimeout(() => this.tone(180, .6, 'sawtooth', .06), 140)
  }

  dispose() {
    this.ctx?.close()
    this.ctx = null
  }
}

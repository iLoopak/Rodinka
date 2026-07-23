import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GAME_CONFIG } from './features/family-jump/config/gameConfig'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const brand = read('./components/FamilyBrand.tsx')
const screen = read('./features/family-jump/components/FamilyJumpScreen.tsx')
const engine = read('./features/family-jump/game/FamilyJumpEngine.ts')
const css = read('./features/family-jump/familyJump.css')
const sharedCss = read('./features/family-games/familyGames.css')

describe('Family Jump V1 polish contract', () => {
  it('opens the game only from a dedicated accessible mark button', () => {
    expect(brand).toContain('className="family-brand-game-button"')
    expect(brand).toContain('aria-label={openGameLabel ?? label.accessibleLabel}')
    expect(brand).not.toContain('className="brand family-brand-game-button"')
  })

  it('keeps member figures single-color and enlarges the visible player with its hitbox', () => {
    expect(engine).toContain('context.fillStyle = this.options.color')
    expect(engine).not.toContain('softColor')
    // The figure is the shared Family Games avatar (game-player-figure) now,
    // not a Family Jump-only shape.
    expect(sharedCss).toMatch(/\.game-player-figure\s*\{[^}]*background:\s*var\(--member-primary\);/s)
    expect(sharedCss).not.toMatch(/\.game-player-figure\s*\{[^}]*inset/s)
    expect(GAME_CONFIG.player.width).toBeGreaterThanOrEqual(45)
    expect(GAME_CONFIG.player.height).toBeGreaterThanOrEqual(52)
  })

  it('protects the safe-area HUD and uses both full gameplay halves for touch', () => {
    expect(screen).toContain('className="family-jump-hud-shield"')
    expect(screen).toContain("onPointerLeave={(event) => release('left', event)}")
    expect(screen).toContain("onPointerLeave={(event) => release('right', event)}")
    expect(css).toMatch(/\.family-jump-hud-shield\s*\{[^}]*env\(safe-area-inset-top\)/s)
    expect(css).toMatch(/\.family-jump-touch-controls\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s)
    expect(css).toMatch(/\.family-jump-touch-controls\s*\{[^}]*top:\s*calc\(70px \+ env\(safe-area-inset-top\)\)/s)
  })

  it('keeps decorative movement subtle and all game-feel transforms visual-only', () => {
    expect(engine).toContain('state.climbedPixels * GAME_CONFIG.environment.decorativeDrift')
    expect(GAME_CONFIG.environment.decorativeDrift).toBeLessThanOrEqual(0.04)
    expect(engine).toContain('platform.impactAnimation')
    expect(engine).toContain('const motionScale = this.options.reducedMotion ? 0 : 1')
    expect(engine).toContain('const drawY = platform.y + impact * 2.5')
  })
})

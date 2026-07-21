import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const fleetCss = readFileSync(fileURLToPath(new URL('./familyFleet.css', import.meta.url)), 'utf8')
import screenSource from './components/FamilyFleetScreen.tsx?raw'
import gameSource from './components/FamilyFleetGame.tsx?raw'
import playerCardSource from '../family-games/components/GamePlayerCard.tsx?raw'

describe('Family Fleet visual polish contract', () => {
  it('uses the shared Family Games player picker, primary CTA, and human empty records copy', () => {
    // The member picker, selected state, and "Play" CTA are the shared
    // Family Games components (also used by Family Jump) rather than
    // Fleet-specific markup.
    expect(screenSource).toContain('GamePlayerPicker')
    expect(screenSource).toContain('GamePlayerFigure')
    expect(screenSource).toContain('GamePrimaryButton')
    expect(screenSource).toContain('memberColorStyle')
    expect(screenSource).toContain('Zatím tu není žádný rekord')
    expect(screenSource).toContain('copy.noRecord')
    expect(playerCardSource).toContain('aria-pressed={selected}')
    expect(playerCardSource).toContain('game-player-card-check')
  })

  it('separates intro from gameplay and keeps menu screens on app theme tokens', () => {
    expect(fleetCss).toContain('background: var(--canvas)')
    expect(fleetCss).toContain('grid-template-columns: minmax(0, 1.1fr)')
    expect(fleetCss).toContain('@media (max-width: 760px)')
    expect(fleetCss).toContain('overflow-x: hidden')
  })

  it('keeps gameplay fullscreen but compacts HUD with safe-area and accessible energy', () => {
    expect(fleetCss).toContain('.fleet-play { position: fixed')
    expect(fleetCss).toContain('env(safe-area-inset-top)')
    expect(fleetCss).toContain('fleet-hud__stats')
    expect(gameSource).toContain('aria-label={`${copy.energy} ${snap.energy}`}')
  })
})

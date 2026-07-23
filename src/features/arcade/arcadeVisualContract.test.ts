import { describe, expect, it } from 'vitest'
import { ARCADE_GAMES } from './gameRegistry'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const arcadeCss = readFileSync(fileURLToPath(new URL('./arcade.css', import.meta.url)), 'utf8')
import cardSource from './components/ArcadeGameCard.tsx?raw'

describe('arcade visual integration contract', () => {
  it('contains both arcade games with distinct artwork variants and routes', () => {
    expect(ARCADE_GAMES.map((game) => game.key)).toEqual(['family-jump', 'family-fleet'])
    expect(ARCADE_GAMES.map((game) => game.route)).toEqual(['/arcade/family-jump', '/arcade/family-fleet'])
    expect(new Set(ARCADE_GAMES.map((game) => game.artworkVariant)).size).toBe(2)
  })

  it('keeps Family Jump preview away from fleet/space artwork', () => {
    expect(cardSource).toContain('JumpPreview')
    expect(cardSource).toContain('FleetPreview')
    const jumpBlock = cardSource.slice(cardSource.indexOf('function JumpPreview'), cardSource.indexOf('function FleetPreview'))
    expect(jumpBlock).not.toMatch(/ship|rocket|planet|asteroid/i)
    expect(jumpBlock).toMatch(/jump-platform|jump-figure|jump-arc/)
  })

  it('uses app card/button primitives and responsive CSS without hub fullscreen styling', () => {
    expect(cardSource).toContain('className="card arcade-game-card"')
    expect(cardSource).toContain('btn btn-primary')
    expect(arcadeCss).not.toContain('100dvh')
    expect(arcadeCss).toContain('overflow: hidden')
    expect(arcadeCss).toContain('@media (max-width: 430px)')
    expect(arcadeCss).toContain('var(--font-size-page-title)')
  })
})

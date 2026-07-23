import { describe, expect, it } from 'vitest'
import jumpScreenSource from '../family-jump/components/FamilyJumpScreen.tsx?raw'
import fleetScreenSource from '../family-fleet/components/FamilyFleetScreen.tsx?raw'

// Locks in the point of this module: every current (and future) Family
// Games entry screen composes the same shared header/hero/player-picker/CTA
// components instead of re-inventing its own. New minigames should follow
// this same pattern — import from '../../family-games', not reinvent it.
const SHARED_COMPONENTS = ['GameHeader', 'GameHero', 'GamePlayerFigure', 'GamePlayerPicker', 'GamePrimaryButton'] as const

describe('Family Games shared entry-flow contract', () => {
  it.each([
    ['Family Jump', jumpScreenSource],
    ['Family Fleet', fleetScreenSource],
  ])('%s composes the shared entry-flow components', (_name, source) => {
    for (const component of SHARED_COMPONENTS) expect(source).toContain(component)
    expect(source).toContain("from '../../family-games'")
    expect(source).toContain("import '../../family-games/familyGames.css'")
  })
})

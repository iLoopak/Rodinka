import { describe, expect, it } from 'vitest'
import { equipCosmetic, isCosmeticUnlocked, loadEquippedLoadout, unlockCosmetics } from './cosmetics'
import { DEFAULT_LOADOUT } from '../cosmetics'
function mem(): Storage { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: (k) => { m.delete(k) }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } } }

describe('family fleet cosmetics storage', () => {
  it('starts every member on the default loadout with defaults always unlocked', () => {
    const s = mem()
    expect(loadEquippedLoadout('f', 'a', s)).toEqual(DEFAULT_LOADOUT)
    expect(isCosmeticUnlocked('f', 'a', 'hull', 'explorer', s)).toBe(true)
    expect(isCosmeticUnlocked('f', 'a', 'hull', 'arrow', s)).toBe(false)
  })

  it('refuses to equip a locked cosmetic', () => {
    const s = mem()
    const next = equipCosmetic('f', 'a', 'hull', 'arrow', s)
    expect(next.hull).toBe('explorer')
  })

  it('equips a cosmetic once unlocked, per member', () => {
    const s = mem()
    unlockCosmetics('f', 'a', ['hull:arrow'], s)
    expect(isCosmeticUnlocked('f', 'a', 'hull', 'arrow', s)).toBe(true)
    expect(isCosmeticUnlocked('f', 'b', 'hull', 'arrow', s)).toBe(false)
    const next = equipCosmetic('f', 'a', 'hull', 'arrow', s)
    expect(next.hull).toBe('arrow')
    expect(loadEquippedLoadout('f', 'a', s).hull).toBe('arrow')
    expect(loadEquippedLoadout('f', 'b', s).hull).toBe('explorer')
  })

  it('recovers from corrupt storage', () => {
    const s = mem()
    s.setItem('rodinka.family-fleet.cosmetics.v1.f', 'not json')
    expect(loadEquippedLoadout('f', 'a', s)).toEqual(DEFAULT_LOADOUT)
  })
})

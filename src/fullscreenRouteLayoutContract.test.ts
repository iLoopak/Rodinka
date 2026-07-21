import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const familyJumpCss = read('./features/family-jump/familyJump.css')
const familyJumpScreen = read('./features/family-jump/components/FamilyJumpScreen.tsx')
const fleetCss = read('./features/family-fleet/familyFleet.css')
const fleetScreen = read('./features/family-fleet/components/FamilyFleetScreen.tsx')
const fleetHangar = read('./features/family-fleet/components/FamilyFleetHangar.tsx')
const routeRegistry = read('./routes/routeRegistry.ts')

describe('fullscreen route layout contract', () => {
  it('registers Family Jump and Family Fleet as fullscreen routes (no app-shell chrome)', () => {
    for (const path of ['/arcade/family-jump', '/arcade/family-fleet', '/arcade/family-fleet/hangar']) {
      const line = routeRegistry.split('\n').find((entry) => entry.includes(`route('${path}',`))
      expect(line, `no route() call found for ${path}`).toBeTruthy()
      expect(line).toContain("'fullscreen'")
    }
  })

  it('Family Jump owns the dynamic viewport with exactly one scrolling region', () => {
    expect(familyJumpCss).toMatch(/\.family-jump-screen\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s)
    expect(familyJumpCss).toMatch(/\.family-jump-menu-scroll\s*\{[^}]*overflow-y:\s*auto/s)
    expect(familyJumpCss).toMatch(/\.family-jump-menu-scroll\s*\{[^}]*env\(safe-area-inset-bottom\)/s)
  })

  it('Family Fleet owns the dynamic viewport with exactly one scrolling region', () => {
    expect(fleetCss).toMatch(/\.fleet-screen\s*\{[^}][\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*hidden/)
    expect(fleetCss).toMatch(/\.fleet-scroll\s*\{[^}]*overflow-y:\s*auto/)
    expect(fleetCss).toMatch(/\.fleet-scroll\s*\{[^}]*env\(safe-area-inset-bottom\)/)
  })

  it('Family Fleet gameplay HUD and zones respect safe-area insets', () => {
    expect(fleetCss).toMatch(/\.fleet-hud\s*\{[^}]*env\(safe-area-inset-top\)/)
    expect(fleetCss).toMatch(/\.fleet-zones\s*\{[^}]*env\(safe-area-inset-bottom\)/)
    expect(fleetCss).toMatch(/\.fleet-play\s*\{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-right\)[^}]*env\(safe-area-inset-bottom\)[^}]*env\(safe-area-inset-left\)/)
  })

  it('every fullscreen game route shares the ref-counted screen lock, not an ad hoc toggle', () => {
    for (const source of [familyJumpScreen, fleetScreen, fleetHangar]) {
      expect(source).toContain("from '../../../hooks/useScreenLock'")
      expect(source).toContain('useScreenLock()')
    }
  })
})

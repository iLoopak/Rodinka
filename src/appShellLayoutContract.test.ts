/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const appShell = readFileSync(join(root, 'src/components/AppShell.tsx'), 'utf8')

describe('AppShell native mobile scrolling contract', () => {
  it('keeps shell chrome outside the scrollable page content', () => {
    expect(appShell).toContain('<header className="app-header">')
    expect(appShell).toContain('<main className="app-main">')
    expect(appShell).toContain('<BottomNavigation />')
    expect(appShell.indexOf('<BottomNavigation />')).toBeGreaterThan(appShell.indexOf('</main>'))
  })

  it('locks viewport and shell scrolling so only app content can scroll', () => {
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[^}]*overflow:\s*hidden/s)
    expect(css).toMatch(/\.app-shell\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s)
    expect(css).toMatch(/main\s*\{[^}]*min-height:\s*0/s)
    expect(css).toMatch(/\.app-main\s*\{[^}]*overflow-y:\s*auto[^}]*-webkit-overflow-scrolling:\s*touch/s)
  })

  it('keeps fixed navigation safe-area aware and out of document flow', () => {
    expect(css).toMatch(/\.bottom-nav\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*0/s)
    expect(css).toContain('padding: 7px calc(8px + env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left));')
  })

  it('pads the header for the top safe area from a single rule', () => {
    const headerRules = [...css.matchAll(/^\.app-header\s*\{([^}]*)\}/gms)]
    expect(headerRules).toHaveLength(1)
    expect(headerRules[0][1]).toMatch(/padding:[^;]*env\(safe-area-inset-top\)/)
    expect(headerRules[0][1]).toMatch(/env\(safe-area-inset-left\)/)
    expect(headerRules[0][1]).toMatch(/env\(safe-area-inset-right\)/)
  })

  it('provides non-color active navigation and a 44px reminder target', () => {
    expect(css).toMatch(/\.bottom-nav-item\.active::after\s*\{[^}]*height:\s*3px/s)
    expect(css).toMatch(/\.reminder-bell\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s)
    expect(appShell).toContain("app-shell${path === '/' ? ' is-today' : ''}")
  })
})

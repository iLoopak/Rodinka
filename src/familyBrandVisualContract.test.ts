import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const logo = readFileSync(join(root, 'src/components/Logo.tsx'), 'utf8')
const shell = readFileSync(join(root, 'src/components/AppShell.tsx'), 'utf8')
const today = readFileSync(join(root, 'src/components/TodayDashboard.tsx'), 'utf8')
const family = readFileSync(join(root, 'src/components/FamilyScreen.tsx'), 'utf8')
const settings = readFileSync(join(root, 'src/components/MoreScreen.tsx'), 'utf8')

describe('family brand visual contract', () => {
  it('gives product and household names one inherited typographic treatment', () => {
    expect(css).toMatch(/\.family-brand-lockup \.wordmark,\s*\.family-brand-lockup \.household-name\s*\{[^}]*font-family:\s*inherit;[^}]*font-size:\s*inherit;[^}]*font-weight:\s*inherit;[^}]*line-height:\s*inherit;/s)
  })

  it('keeps the static public logo data-independent', () => {
    expect(logo).not.toContain('FamilyMember')
    expect(logo).not.toContain('memberColor')
    expect(logo).toContain('fill="#B94742"')
  })

  it('uses FamilyMark in authenticated brand contexts', () => {
    expect(shell).toContain('<FamilyBrand')
    expect(today).toContain('<FamilyMark members={members}')
    expect(family).toContain('<FamilyMark members={members}')
    expect(settings).toContain('<FamilyMark members={activeFamilyMembers}')
  })

  it('removes decorative notification dots that compete with the mark', () => {
    expect(css).not.toContain('.app-header::after')
  })
})

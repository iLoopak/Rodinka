import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFamilyMarkSlots, STATIC_FAMILY_MARK_COLORS } from './utils/familyMark'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const css = read('src/index.css')
const mark = read('src/components/FamilyMark.tsx')
const icon = read('public/icon.svg')

describe('family brand visual contract', () => {
  it('gives product and household names one inherited typographic treatment', () => {
    expect(css).toMatch(/\.family-brand-lockup \.wordmark,\s*\.family-brand-lockup \.household-name\s*\{[^}]*font-family:\s*inherit;[^}]*font-size:\s*inherit;[^}]*font-weight:\s*inherit;[^}]*line-height:\s*inherit;/s)
  })

  it('has one reusable renderer for both static and dynamic variants', () => {
    expect(mark).toContain("variant: 'static'")
    expect(mark).toContain("variant: 'dynamic'")
    expect(existsSync(join(root, 'src/components/Logo.tsx'))).toBe(false)
    expect(existsSync(join(root, 'public/favicon.svg'))).toBe(false)
  })

  it('uses FamilyMark in every Rodinka brand context', () => {
    const expectedUsages = [
      ['src/App.tsx', 'variant="static"'],
      ['src/components/AuthScreen.tsx', 'variant="static"'],
      ['src/components/OnboardingScreen.tsx', 'variant="static"'],
      ['src/components/FamilyBrand.tsx', 'variant="dynamic"'],
      ['src/components/TodayDashboard.tsx', 'variant="dynamic"'],
      ['src/components/FamilyScreen.tsx', 'variant="dynamic"'],
      ['src/components/MoreScreen.tsx', 'variant="dynamic"'],
      ['src/components/ui/EmptyState.tsx', 'variant="dynamic"'],
    ] as const
    for (const [path, variant] of expectedUsages) {
      const source = read(path)
      expect(source).toContain('<FamilyMark')
      expect(source).toContain(variant)
    }
  })

  it('removes copied petal JSX and transform-based motif scaling', () => {
    expect(css).not.toContain('empty-state-motif')
    expect(css).not.toContain('brand-motif')
    expect(css).not.toMatch(/empty-state[^}]*transform:\s*scale/s)
    expect(read('src/components/ui/EmptyState.tsx')).not.toContain('<i />')
  })

  it('keeps the generated public icon aligned with the shared static geometry and colors', () => {
    const slots = createFamilyMarkSlots(4)
    for (const [index, slot] of slots.entries()) {
      const x = slot.cx - slot.size / 2
      const y = slot.cy - slot.size / 2
      expect(icon).toContain(`x="${x}" y="${y}" width="${slot.size}" height="${slot.size}"`)
      expect(icon).toContain(`fill="${STATIC_FAMILY_MARK_COLORS[index]}"`)
      expect(icon).toContain(`rotate(${slot.rotation} ${slot.cx} ${slot.cy})`)
    }
  })

  it('uses the single public icon for favicon and launcher contexts', () => {
    expect(read('index.html')).toContain('href="/icon.svg"')
    expect(read('public/manifest.webmanifest')).toContain('"src": "/icon.svg"')
  })

  it('does not leave legacy hardcoded petal colors in screen components', () => {
    for (const path of [
      'src/components/AuthScreen.tsx', 'src/components/OnboardingScreen.tsx',
      'src/components/TodayDashboard.tsx', 'src/components/ui/EmptyState.tsx',
    ]) {
      expect(read(path)).not.toMatch(/#B94742|#E96C62|#97302B|#F2A99F/)
    }
  })
})

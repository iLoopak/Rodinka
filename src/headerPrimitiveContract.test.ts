import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Design Wave 1: the screen-header + button vocabulary, guarded so it does not
 * drift back into the four spellings the audit found.
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function componentFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(root, rel)).isDirectory()) componentFiles(rel, acc)
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) acc.push(rel)
  }
  return acc
}

const FILES = componentFiles('src/components')

describe('screen header primitive', () => {
  it('renders every feature screen header through ScreenHeader', () => {
    // Planner was the last screen with hand-rolled `.screen-header` markup; the
    // guard is that no component builds one inline again instead of using the
    // primitive. The primitive itself is the sole allowed definition.
    const offenders = FILES
      .filter((file) => file !== 'src/components/ui/ScreenHeader.tsx')
      .filter((file) => /className="screen-header|className=\{`screen-header/.test(read(file)))
    expect(offenders).toEqual([])
  })

  it('names the shared title class after the header, not after Home', () => {
    // `home-title` used to be the class on every screen's <h1>, including the
    // ones that are not Home. The shared primitive now uses `screen-title`.
    const header = read('src/components/ui/ScreenHeader.tsx')
    expect(header).toContain('className="screen-title"')
    expect(header).not.toContain('home-title')
  })

  it('keeps `home-title` for the actual Home screen only', () => {
    const users = FILES.filter((file) => read(file).includes('"home-title"'))
    expect(users).toEqual(['src/components/TodayDashboard.tsx'])
  })
})

describe('header action button vocabulary', () => {
  it('routes header create actions through the Button primitive', () => {
    // The eight "+ add" header actions and the calendar/planner header buttons
    // were open-coded `<button className="header-action-button">`. A new one
    // must go through <Button>/<IconButton>, so the class is no longer written
    // by hand anywhere but the filter toggle (its own primitive) and the CSS.
    const offenders: string[] = []
    for (const file of FILES) {
      const source = read(file)
      // The screen header's action slot is where these buttons live.
      if (/className="header-action-button"/.test(source)) offenders.push(file)
      if (/className="header-icon-button"/.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('requires an accessible label on the icon button primitive', () => {
    const button = read('src/components/ui/Button.tsx')
    // The label is required by the type, not merely encouraged.
    expect(button).toMatch(/'aria-label':\s*string/)
  })

  it('keeps variant and placement separate', () => {
    // Appearance is the variant's job; size and position belong to the
    // container. The toolbar sizes its own buttons rather than the variant
    // carrying header dimensions (audit D2-2).
    const css = read('src/styles/primitives/button.css')
    expect(css).toMatch(/\.header-actions \.btn\s*\{/)
    const button = read('src/components/ui/Button.tsx')
    expect(button).not.toContain('header-action-button')
  })
})

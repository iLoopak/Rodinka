import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * App-wide "Přidat"/create-action unification.
 *
 * The audit found a "+ Add" spelled a different way on almost every screen:
 * a pill-shaped FAB (Today hero), a text-only link (Today empty program),
 * an outlined button masquerading as primary (Planner), a secondary-styled
 * "new" button (Messages), and several `btn-secondary` "+ label" buttons
 * (member planning shortcuts, meal-plan per-day empty state). They now all
 * go through `AppPrimaryAddButton` / `AppToolbarAddButton` / `AddActionIcon`
 * in `src/components/ui/AddAction.tsx`, which is the only file allowed to
 * touch the underlying `Button`/`IconButton` primitives directly for a
 * create action. This guards against a new hand-rolled one creeping back in.
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

const FILES = [...componentFiles('src/components'), ...componentFiles('src/features')]
  .filter((file) => file !== 'src/components/ui/AddAction.tsx')

describe('add-action vocabulary', () => {
  it('routes every "+" create action through AddAction.tsx, not the raw primitives', () => {
    const offenders = FILES.filter((file) => /leadingIcon="\+"/.test(read(file)))
    expect(offenders).toEqual([])
  })

  it('keeps IconButton free of hand-rolled bare "+" create triggers', () => {
    // AddActionIcon is the one place a bare "+" child is allowed on IconButton.
    const offenders = FILES.filter((file) => /<IconButton[^>]*>\s*\+\s*<\/IconButton>/.test(read(file)))
    expect(offenders).toEqual([])
  })

  it('does not reintroduce the pre-unification spellings', () => {
    // Each of these was a distinct look for the same "create a record" intent:
    // a rounded FAB, a text-only link, a plain `btn-secondary`, or an
    // unstyled bare button standing in for the shared add action.
    const patterns = [
      /className="hero-action-button"[^>]*>\s*<span/, // old: bare <button className="hero-action-button"><span>+</span>...
      /className="link today-program-empty-action"/,
      /className="btn-secondary messages-new-button"/,
      /<button[^>]*onClick=\{\(\) => openForMember\('household-task'\)\}[^>]*className="btn-secondary"/,
    ]
    const offenders = FILES.filter((file) => {
      const source = read(file)
      return patterns.some((pattern) => pattern.test(source))
    })
    expect(offenders).toEqual([])
  })

  it('gives EmptyState a primary-vs-secondary action distinction', () => {
    const source = read('src/components/ui/EmptyState.tsx')
    expect(source).toContain("variant?: 'primary' | 'secondary'")
    expect(source).toContain('AppPrimaryAddButton')
  })

  it('requires an accessible label on the icon-only add trigger', () => {
    const source = read('src/components/ui/AddAction.tsx')
    expect(source).toMatch(/'aria-label':\s*string/)
  })
})

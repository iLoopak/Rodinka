/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
const scopedVariables = new Set(['--area-accent', '--week-entry-accent', '--week-entry-surface'])

describe('design-system CSS contract', () => {
  it('does not reference undefined global custom properties', () => {
    const definitions = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]))
    const references = [...css.matchAll(/var\((--[a-z0-9-]+)(?:\s*,[^)]*)?\)/g)]
      .filter((match) => !match[0].includes(','))
      .map((match) => match[1])
      .filter((name) => !definitions.has(name) && !scopedVariables.has(name))

    expect([...new Set(references)]).toEqual([])
  })

  it('keeps the documented reduced-motion override', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toMatch(/animation-duration:\s*0\.001ms\s*!important/)
  })

  it('keeps planning rows as single, full-width navigation targets', () => {
    expect(css).toMatch(/\.planner-area-link\s*\{[^}]*flex:\s*1 1 auto/s)
    expect(css).toMatch(/\.planner-area-chevron\s*\{[^}]*font-size:/s)
  })

  it('does not use left borders as status or category accents', () => {
    expect(css).not.toMatch(/border-(?:left|inline-start)(?:-color)?:/)
  })
})

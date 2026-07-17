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

  it('keeps planner create icons centered in their square touch targets', () => {
    expect(css).toMatch(/\.planner-area-create\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*min-width:\s*44px[^}]*min-height:\s*44px[^}]*padding:\s*0/s)
    expect(css).toMatch(/\.planner-area-create svg\s*\{[^}]*display:\s*block/s)
  })
})

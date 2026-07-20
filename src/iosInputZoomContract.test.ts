import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appStyles } from './utils/testStylesheets'

const root = process.cwd()
const css = appStyles()
const html = readFileSync(join(root, 'index.html'), 'utf8')

describe('iOS input auto-zoom prevention contract', () => {
  it('keeps the shared control font size at or above 16px', () => {
    const controlVar = css.match(/--font-size-control:\s*([\d.]+)(rem|px);/)
    expect(controlVar).not.toBeNull()
    const [, value, unit] = controlVar!
    const px = unit === 'rem' ? Number(value) * 16 : Number(value)
    expect(px).toBeGreaterThanOrEqual(16)
  })

  it('applies the control font size to every base input, select and textarea', () => {
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*var\(--font-size-control\)/s)
  })

  it('does not disable pinch-zoom or force a fixed viewport scale', () => {
    const viewportMeta = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)
    expect(viewportMeta).not.toBeNull()
    const content = viewportMeta![1]
    expect(content).not.toMatch(/user-scalable\s*=\s*no/)
    expect(content).not.toMatch(/maximum-scale/)
  })
})

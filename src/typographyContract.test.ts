import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const documentSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')

describe('typography contract', () => {
  it('loads every Manrope weight used by the design system', () => {
    for (const weight of [500, 600, 700, 800]) {
      expect(mainSource).toContain(`@fontsource/manrope/${weight}.css`)
    }
    expect(documentSource).not.toContain('fonts.googleapis.com')
    expect(styles).not.toMatch(/font-weight:\s*(650|750)\b/)
  })

  it('defines shared roles for repeated text hierarchy', () => {
    for (const token of [
      '--font-size-page-title', '--font-size-section-title', '--font-size-item-title',
      '--font-size-body', '--font-size-action', '--font-size-meta',
      '--font-weight-strong', '--line-height-meta',
    ]) expect(styles).toContain(token)
  })
})

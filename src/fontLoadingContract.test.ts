import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Wave 7 measured the font setup instead of assuming it, and the conclusion was
// "leave it alone". These tests pin the reasons so a future cleanup does not
// repeat the tempting-but-wrong optimization.

const root = process.cwd()
const main = readFileSync(join(root, 'src/main.tsx'), 'utf8')
const tokens = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8')
const fontsource = (file: string) =>
  readFileSync(join(root, 'node_modules/@fontsource/manrope', file), 'utf8')

const WEIGHTS = ['500', '600', '700', '800']

describe('Manrope loading', () => {
  it('imports exactly the weights the tokens declare', () => {
    for (const weight of WEIGHTS) {
      expect(main).toContain(`@fontsource/manrope/${weight}.css`)
      expect(tokens).toContain(`: ${weight};`)
    }
  })

  it('uses the aggregate stylesheets, which are the ones carrying unicode-range', () => {
    // The obvious "only ship latin + latin-ext" optimization is a trap with
    // this package: the per-subset stylesheets declare @font-face WITHOUT a
    // unicode-range. Importing latin-600 and latin-ext-600 together would give
    // one family/weight two unranged faces, the last would win for every
    // character, and latin-ext does not contain the basic Latin glyphs — so
    // ordinary text would fall out of Manrope entirely.
    for (const weight of WEIGHTS) {
      expect(fontsource(`latin-${weight}.css`)).not.toContain('unicode-range')
      expect(fontsource(`latin-ext-${weight}.css`)).not.toContain('unicode-range')
      expect(main).not.toContain(`@fontsource/manrope/latin-${weight}.css`)
      expect(main).not.toContain(`@fontsource/manrope/latin-ext-${weight}.css`)
    }
  })

  it('keeps every subset behind a unicode-range so the browser fetches only what it renders', () => {
    for (const weight of WEIGHTS) {
      const sheet = fontsource(`${weight}.css`)
      const faces = sheet.match(/@font-face/g) ?? []
      const ranges = sheet.match(/unicode-range/g) ?? []
      // Every declared face must be range-gated; an unranged one would be
      // downloaded unconditionally.
      expect(ranges.length).toBe(faces.length)
      expect(faces.length).toBeGreaterThan(1)
    }
  })

  it('covers every Czech diacritic across the latin and latin-ext ranges', () => {
    const czech = 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ'
    const sheet = fontsource('600.css')
    const ranges = [...sheet.matchAll(/unicode-range:\s*([^;]+);/g)]
      .flatMap(([, list]) => list.split(',').map((part) => part.trim()))
      .filter((part) => /^U\+/.test(part))
      .map((part) => {
        const [from, to] = part.replace('U+', '').split('-')
        return { from: parseInt(from, 16), to: parseInt(to ?? from, 16) }
      })
    for (const char of czech) {
      const cp = char.codePointAt(0)!
      expect(ranges.some((r) => cp >= r.from && cp <= r.to), `missing ${char}`).toBe(true)
    }
  })

  it('keeps the serif accent on system fonts so it needs no download and works offline', () => {
    expect(tokens).toContain('--font-family-accent')
    expect(tokens).toMatch(/--font-family-accent:[^;]*Georgia/)
  })
})

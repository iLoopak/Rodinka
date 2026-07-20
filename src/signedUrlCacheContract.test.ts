import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SIGNED_URL_CACHE_MARGIN_MS, signedUrlMaxAgeMs } from './queryCache'

const root = process.cwd()
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')

describe('signed URL cache lifetime', () => {
  it('always expires the cached payload before the URL inside it', () => {
    for (const seconds of [12 * 60 * 60, 2 * 60 * 60, 90 * 60]) {
      // A cached entry that outlives its signed URLs hands the UI links that
      // 403: broken avatars and a missing family header, with no error to
      // explain it.
      expect(signedUrlMaxAgeMs(seconds)).toBeLessThan(seconds * 1000)
    }
  })

  it('leaves a usable margin for the 12h TTL both call sites use', () => {
    expect(signedUrlMaxAgeMs(12 * 60 * 60)).toBe(11 * 60 * 60 * 1000)
  })

  it('never returns a negative age for a TTL shorter than the margin', () => {
    // Clamped rather than negative: a short-lived URL should mean "do not
    // reuse this from cache", not an age that compares strangely.
    expect(signedUrlMaxAgeMs(30 * 60)).toBe(0)
    expect(signedUrlMaxAgeMs(0)).toBe(0)
    expect(SIGNED_URL_CACHE_MARGIN_MS).toBeGreaterThan(0)
  })

  it('derives the max age at both signed-URL call sites instead of hardcoding it', () => {
    // The two values used to be independent constants that merely happened to
    // be ordered correctly. Editing one alone broke images silently, so the
    // relationship has to stay expressed in code.
    const members = read('src/hooks/useFamilyMembers.ts')
    expect(members).toContain('maxAgeMs: signedUrlMaxAgeMs(AVATAR_SIGNED_URL_SECONDS)')

    const settings = read('src/context/family/FamilySettingsContext.tsx')
    expect(settings).toContain('maxAgeMs: signedUrlMaxAgeMs(FAMILY_HERO_SIGNED_URL_SECONDS)')
  })
})

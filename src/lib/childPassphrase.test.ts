import { describe, expect, it } from 'vitest'
import { CHILD_PASSWORD_MAX_LENGTH, CHILD_PASSWORD_MIN_LENGTH, generateChildPassphrase, isValidChildPassword } from './childPassphrase'

describe('generateChildPassphrase', () => {
  it('produces a typable three-word passphrase the server will accept', () => {
    const passphrase = generateChildPassphrase()
    expect(passphrase).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/)
    expect(isValidChildPassword(passphrase)).toBe(true)
  })

  it('avoids accented characters so any keyboard can type it', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateChildPassphrase()).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('does not repeat itself across calls', () => {
    const generated = new Set(Array.from({ length: 50 }, () => generateChildPassphrase()))
    // 32^3 * 90 combinations: collisions in 50 draws would mean the entropy
    // source is broken, not unlucky.
    expect(generated.size).toBe(50)
  })
})

describe('isValidChildPassword', () => {
  it('mirrors the Edge Function bounds', () => {
    expect(isValidChildPassword('a'.repeat(CHILD_PASSWORD_MIN_LENGTH))).toBe(true)
    expect(isValidChildPassword('a'.repeat(CHILD_PASSWORD_MIN_LENGTH - 1))).toBe(false)
    expect(isValidChildPassword('a'.repeat(CHILD_PASSWORD_MAX_LENGTH))).toBe(true)
    expect(isValidChildPassword('a'.repeat(CHILD_PASSWORD_MAX_LENGTH + 1))).toBe(false)
  })
})

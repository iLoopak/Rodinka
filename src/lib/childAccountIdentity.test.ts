import { describe, expect, it } from 'vitest'
import { childLoginNameToInternalEmail, internalEmailToChildLoginName, isValidChildLoginName, normalizeChildLoginName } from './childAccountIdentity'

describe('managed child login identity', () => {
  it('normalizes public login names deterministically', () => {
    expect(normalizeChildLoginName('  Žofka Nováková  ')).toBe('zofka-novakova')
    expect(normalizeChildLoginName('KID..One')).toBe('kid-one')
  })

  it('accepts only canonical child login names', () => {
    expect(isValidChildLoginName('zofka-7')).toBe(true)
    expect(isValidChildLoginName('Žofka')).toBe(false)
    expect(isValidChildLoginName('ab')).toBe(false)
  })

  it('maps the public name to the reserved internal Auth identifier', () => {
    expect(childLoginNameToInternalEmail('zofka-7')).toBe('child.zofka-7@children.rodinka.invalid')
  })

  it('recovers only the public name from a managed internal identifier', () => {
    expect(internalEmailToChildLoginName('child.zofka-7@children.rodinka.invalid')).toBe('zofka-7')
    expect(internalEmailToChildLoginName('parent@example.com')).toBeNull()
  })
})

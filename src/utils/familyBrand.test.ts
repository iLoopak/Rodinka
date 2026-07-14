import { describe, expect, it } from 'vitest'
import { formatFamilyBrand, normalizeFamilyName } from './familyBrand'

describe('formatFamilyBrand', () => {
  it('joins the product and normalized household name', () => {
    expect(formatFamilyBrand('  Novákovi  ')).toEqual({
      productName: 'Rodinka', householdName: 'Novákovi', accessibleLabel: 'Rodinka Novákovi',
    })
    expect(normalizeFamilyName('Rodina   Horákových')).toBe('Rodina Horákových')
  })

  it('falls back to the product for missing and duplicate values', () => {
    expect(formatFamilyBrand(null).householdName).toBeNull()
    expect(formatFamilyBrand('   ').accessibleLabel).toBe('Rodinka')
    expect(formatFamilyBrand('rodinka').accessibleLabel).toBe('Rodinka')
  })

  it('removes a duplicated product prefix but retains the actual family name', () => {
    expect(formatFamilyBrand('Rodinka Novákovi').householdName).toBe('Novákovi')
    expect(formatFamilyBrand('Rodinka · Rodina Novákových').householdName).toBe('Rodina Novákových')
  })

  it('preserves unusually long names for accessible and title presentation', () => {
    const name = 'Rodina Horákových z Dolní Lhoty a jejich nejbližší'
    expect(formatFamilyBrand(name)).toMatchObject({ householdName: name, accessibleLabel: `Rodinka ${name}` })
  })
})

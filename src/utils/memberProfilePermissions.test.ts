import { describe, expect, it } from 'vitest'
import { canEditMemberProfile, editableMemberProfileFields, memberProfileAccess } from './memberProfilePermissions'
import { makeFamilyMember } from './testFixtures'

const parent = makeFamilyMember({ id: 'parent-1', role: 'parent', user_id: 'user-parent' })
const otherParent = makeFamilyMember({ id: 'parent-2', role: 'parent', user_id: 'user-other' })
const child = makeFamilyMember({ id: 'child-1', role: 'child', user_id: 'user-child' })
const sibling = makeFamilyMember({ id: 'child-2', role: 'child' })

describe('member profile permission matrix', () => {
  it('lets a parent edit themself and children, but not another adult', () => {
    expect(memberProfileAccess(parent, parent)).toBe('full')
    expect(memberProfileAccess(parent, child)).toBe('full')
    expect(memberProfileAccess(parent, otherParent)).toBe('none')
  })

  it('lets a child edit only their own limited profile', () => {
    expect(memberProfileAccess(child, child)).toBe('limited')
    expect(canEditMemberProfile(child, sibling)).toBe(false)
    expect(canEditMemberProfile(child, parent)).toBe(false)
  })

  it('denies members from another family', () => {
    const outsider = makeFamilyMember({ id: 'outsider', family_id: 'family-2', role: 'admin' })
    expect(canEditMemberProfile(outsider, child)).toBe(false)
  })
})

describe('editable profile fields', () => {
  it('allows all profile fields for a parent editing themself or a child', () => {
    for (const target of [parent, child]) {
      expect(editableMemberProfileFields(parent, target)).toEqual({
        displayName: true,
        birthDate: true,
        color: true,
        avatar: true,
        grammaticalGender: true,
      })
    }
  })

  it('limits a child account to color, avatar, and grammatical gender', () => {
    expect(editableMemberProfileFields(child, child)).toEqual({
      displayName: false,
      birthDate: false,
      color: true,
      avatar: true,
      grammaticalGender: true,
    })
  })
})

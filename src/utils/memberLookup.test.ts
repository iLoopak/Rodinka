import { describe, expect, it } from 'vitest'
import { createMemberLookup, resolveCurrentMember } from './memberLookup'
import { makeFamilyMember } from './testFixtures'

describe('member lookup refresh', () => {
  it('returns a complete profile and refreshes the current member by ID', () => {
    const initial = makeFamilyMember({ display_name: 'Old name' })
    const refreshed = makeFamilyMember({
      display_name: 'New name',
      color_key: 'berry',
      avatar_path: 'family-1/member-1/avatar.webp',
      avatar_url: 'signed-url',
      grammatical_gender: 'feminine',
    })
    const memberById = createMemberLookup([refreshed])

    expect(memberById(initial.id)).toBe(refreshed)
    expect(resolveCurrentMember(initial, memberById)).toEqual(refreshed)
  })

  it('falls back to the original membership while the member list is unavailable', () => {
    const initial = makeFamilyMember()
    expect(resolveCurrentMember(initial, createMemberLookup([]))).toBe(initial)
  })
})

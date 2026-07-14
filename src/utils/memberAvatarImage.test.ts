import { describe, expect, it } from 'vitest'
import {
  MEMBER_AVATAR_MAX_INPUT_BYTES,
  buildMemberAvatarPath,
  validateMemberAvatarFile,
} from './memberAvatarImage'

describe('member avatar image validation', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateMemberAvatarFile({ type, size: 1024 })).toBeNull()
  })

  it('rejects SVG, empty files, and oversized inputs', () => {
    expect(validateMemberAvatarFile({ type: 'image/svg+xml', size: 1024 })).toBe('unsupported')
    expect(validateMemberAvatarFile({ type: 'image/png', size: 0 })).toBe('empty')
    expect(validateMemberAvatarFile({ type: 'image/jpeg', size: MEMBER_AVATAR_MAX_INPUT_BYTES + 1 })).toBe('too_large')
  })

  it('builds a family/member/unique-file storage path', () => {
    expect(
      buildMemberAvatarPath(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'webp',
        '33333333-3333-4333-8333-333333333333'
      )
    ).toBe(
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp'
    )
  })
})

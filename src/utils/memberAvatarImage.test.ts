import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MEMBER_AVATAR_MAX_INPUT_BYTES,
  MEMBER_AVATAR_MAX_ZOOM,
  MEMBER_AVATAR_CROP_SIZE,
  avatarCropGeometry,
  buildMemberAvatarPath,
  clampAvatarCropTransform,
  createCroppedMemberAvatar,
  initialAvatarCropTransform,
  validateMemberAvatarFile,
} from './memberAvatarImage'

describe('member avatar image validation', () => {
  afterEach(() => vi.unstubAllGlobals())
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

  it('centers landscape and portrait images while covering the square viewport', () => {
    const landscape = avatarCropGeometry(1200, 800, 320, initialAvatarCropTransform())
    expect(landscape).toMatchObject({ renderedWidth: 480, renderedHeight: 320, x: -80, y: 0 })
    const portrait = avatarCropGeometry(800, 1200, 320, initialAvatarCropTransform())
    expect(portrait).toMatchObject({ renderedWidth: 320, renderedHeight: 480, x: 0, y: -80 })
  })

  it('clamps drag offsets so the crop never exposes empty space', () => {
    expect(clampAvatarCropTransform(1200, 800, 320, { zoom: 1, offsetX: 999, offsetY: 999 }))
      .toEqual({ zoom: 1, offsetX: 80, offsetY: 0 })
  })

  it('clamps zoom to the accessible slider range and reset is centered', () => {
    expect(clampAvatarCropTransform(800, 800, 320, { zoom: 99, offsetX: 0, offsetY: 0 }).zoom)
      .toBe(MEMBER_AVATAR_MAX_ZOOM)
    expect(initialAvatarCropTransform()).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
  })

  it('produces a compressed square WebP crop', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['crop'], { type: 'image/webp' })),
    }
    vi.stubGlobal('document', { createElement: () => canvas })
    const output = await createCroppedMemberAvatar(
      { source: {} as CanvasImageSource, width: 1200, height: 800 },
      320,
      { zoom: 1.5, offsetX: 20, offsetY: 0 }
    )
    expect(canvas.width).toBe(MEMBER_AVATAR_CROP_SIZE)
    expect(canvas.height).toBe(MEMBER_AVATAR_CROP_SIZE)
    expect(output.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledOnce()
  })
})

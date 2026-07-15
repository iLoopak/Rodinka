import { describe, expect, it, vi } from 'vitest'
import {
  FAMILY_HERO_OUTPUT_HEIGHT,
  FAMILY_HERO_OUTPUT_WIDTH,
  buildFamilyHeroPath,
  clampFamilyHeroCropTransform,
  createCroppedFamilyHero,
  familyHeroCropGeometry,
  validateFamilyHeroFile,
} from './familyHeroImage'

describe('family hero image', () => {
  it('validates supported image files and builds family-scoped paths', () => {
    expect(validateFamilyHeroFile({ type: 'image/jpeg', size: 100 })).toBeNull()
    expect(validateFamilyHeroFile({ type: 'image/svg+xml', size: 100 })).toBe('unsupported')
    expect(buildFamilyHeroPath('family-1', 'webp', 'image-1')).toBe('family-1/image-1.webp')
  })

  it('covers a wide viewport and clamps drag offsets', () => {
    const geometry = familyHeroCropGeometry(1200, 800, 320, 140, { zoom: 1, offsetX: 0, offsetY: 0 })
    expect(geometry.renderedWidth).toBeGreaterThanOrEqual(320)
    expect(geometry.renderedHeight).toBeGreaterThanOrEqual(140)
    const clamped = clampFamilyHeroCropTransform(1200, 800, 320, 140, { zoom: 1, offsetX: 999, offsetY: 999 })
    expect(clamped.zoom).toBe(1)
    expect(clamped.offsetX).toBe(0)
    expect(clamped.offsetY).toBeCloseTo(36.67, 2)
  })

  it('creates a compressed wide crop', async () => {
    const context = { drawImage: vi.fn() }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['hero'], { type: 'image/webp' })),
    }
    vi.stubGlobal('document', { createElement: () => canvas })

    const output = await createCroppedFamilyHero({ source: {} as CanvasImageSource, width: 1200, height: 800 }, 320, 140, { zoom: 1, offsetX: 0, offsetY: 0 })

    expect(canvas.width).toBe(FAMILY_HERO_OUTPUT_WIDTH)
    expect(canvas.height).toBe(FAMILY_HERO_OUTPUT_HEIGHT)
    expect(output.name).toBe('family-hero-cropped.webp')
    expect(context.drawImage).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})

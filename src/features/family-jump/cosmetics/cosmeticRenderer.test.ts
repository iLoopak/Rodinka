import { describe, expect, it, vi } from 'vitest'
import { anchorForSlot, cosmeticAnchors } from './cosmeticAnchors'
import { COSMETIC_RENDER_ORDER, renderEquippedCosmetics } from './cosmeticRenderer'

function contextStub() {
  const noop = vi.fn()
  return {
    save: noop, restore: noop, beginPath: noop, arc: noop, moveTo: noop, lineTo: noop,
    stroke: noop, fill: noop, closePath: noop, quadraticCurveTo: noop,
    set lineCap(_value: CanvasLineCap) {}, set lineJoin(_value: CanvasLineJoin) {},
    set lineWidth(_value: number) {}, set strokeStyle(_value: string) {}, set fillStyle(_value: string) {},
  } as unknown as CanvasRenderingContext2D
}

describe('Family Jump cosmetic renderer', () => {
  it('selects stable local anchors for every slot', () => {
    const anchors = cosmeticAnchors(46, 53)
    expect(anchorForSlot(anchors, 'head')).toBe(anchors.headAnchor)
    expect(anchorForSlot(anchors, 'face')).toBe(anchors.faceAnchor)
    expect(anchorForSlot(anchors, 'neck')).toBe(anchors.neckAnchor)
    expect(anchorForSlot(anchors, 'feet')).toBe(anchors.leftFootAnchor)
  })

  it('keeps a deterministic render order and accepts combined slots', () => {
    expect(COSMETIC_RENDER_ORDER).toEqual(['feet', 'neck', 'face', 'head'])
    expect(() => renderEquippedCosmetics(contextStub(), { feet: 'striped-socks', face: 'round-glasses', head: 'jumper-hat' }, 46, 53)).not.toThrow()
  })

  it('does not mutate dimensions used by the hitbox', () => {
    const dimensions = { width: 46, height: 53 }
    renderEquippedCosmetics(contextStub(), { head: 'family-crown' }, dimensions.width, dimensions.height)
    expect(dimensions).toEqual({ width: 46, height: 53 })
  })
})

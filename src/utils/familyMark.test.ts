import { describe, expect, it } from 'vitest'
import {
  createFamilyMarkModel,
  createFamilyMarkSlots,
  createStaticFamilyMarkSlots,
  familyMarkPetalBounds,
  familyMarkPetalPath,
  FAMILY_MARK_VIEW_BOX_SIZE,
  orderedFamilyMarkMembers,
} from './familyMark'

const members = Array.from({ length: 8 }, (_, index) => ({
  id: `member-${String.fromCharCode(104 - index)}`,
  color_key: index % 2 === 0 ? 'blue' as const : 'honey' as const,
}))

const FAMILY_SIZES = [1, 2, 3, 4, 5, 6, 8, 12]

describe('family mark geometry', () => {
  it.each(FAMILY_SIZES)('gives every one of %i members their own shape', (count) => {
    const model = createFamilyMarkModel(members.slice(0, Math.min(count, members.length)))
    const expected = Math.min(count, members.length)
    expect(model.members).toHaveLength(expected)
    expect(model.slots).toHaveLength(expected)
  })

  it('orders members by stable id rather than incoming query order', () => {
    const ordered = orderedFamilyMarkMembers(members.slice(0, 4))
    expect(ordered.map((member) => member.id)).toEqual(['member-e', 'member-f', 'member-g', 'member-h'])
  })

  it('returns fresh ordered arrays without mutating context data', () => {
    const input = members.slice(0, 3)
    const before = input.map((member) => member.id)
    orderedFamilyMarkMembers(input)
    expect(input.map((member) => member.id)).toEqual(before)
  })

  it('renders identically across reloads for the same family', () => {
    const shuffled = [members[2], members[0], members[1]]
    expect(createFamilyMarkModel(members.slice(0, 3))).toEqual(createFamilyMarkModel(shuffled))
    expect(createFamilyMarkSlots(4)).toEqual(createFamilyMarkSlots(4))
  })

  it.each(FAMILY_SIZES)('centers and contains the %i-member geometry', (count) => {
    const slots = createFamilyMarkSlots(count)
    const centerX = slots.reduce((sum, slot) => sum + slot.cx, 0) / slots.length
    expect(centerX).toBeCloseTo(FAMILY_MARK_VIEW_BOX_SIZE / 2, 3)

    for (const slot of slots) {
      expect(slot.cy).toBe(FAMILY_MARK_VIEW_BOX_SIZE / 2)
      const bounds = familyMarkPetalBounds(slot)
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(FAMILY_MARK_VIEW_BOX_SIZE)
      expect(bounds.bottom).toBeLessThanOrEqual(FAMILY_MARK_VIEW_BOX_SIZE)
    }
  })

  it('keeps a single member upright and centered', () => {
    const [only] = createFamilyMarkSlots(1)
    expect(only.cx).toBe(FAMILY_MARK_VIEW_BOX_SIZE / 2)
    expect(only.rotation).toBe(0)
  })

  it('fans the outer shapes away from an upright middle', () => {
    const [left, middle, right] = createFamilyMarkSlots(3)
    expect(left.rotation).toBeLessThan(0)
    expect(middle.rotation).toBe(0)
    expect(right.rotation).toBeGreaterThan(0)
    expect(middle.height).toBeGreaterThan(left.height)
    expect(middle.height).toBeGreaterThan(right.height)
  })

  it('varies height subtly rather than rendering identical bars', () => {
    const heights = new Set(createFamilyMarkSlots(5).map((slot) => slot.height))
    expect(heights.size).toBeGreaterThan(1)
  })

  it('makes adults taller than children in the same position', () => {
    const [adult] = createFamilyMarkSlots(2, ['parent', 'child'])
    const [child] = createFamilyMarkSlots(2, ['child', 'child'])
    expect(adult.height).toBeGreaterThan(child.height)
  })

  it('ignores unknown roles instead of guessing a height', () => {
    expect(createFamilyMarkSlots(3)).toEqual(createFamilyMarkSlots(3, [null, undefined, null]))
  })

  it('compacts a growing family instead of widening the mark', () => {
    const widths = FAMILY_SIZES.map((count) => createFamilyMarkSlots(count)[0].width)
    for (let index = 1; index < widths.length; index++) {
      expect(widths[index]).toBeLessThanOrEqual(widths[index - 1])
    }
  })

  it('overlaps a large family gracefully once shapes reach their minimum width', () => {
    const small = createFamilyMarkSlots(3)
    const large = createFamilyMarkSlots(12)
    const gapOf = (slots: typeof small) => slots[1].cx - slots[0].cx - slots[0].width

    expect(gapOf(small)).toBeGreaterThan(0)
    expect(gapOf(large)).toBeLessThan(0)
    expect(large[0].width).toBeGreaterThanOrEqual(9)
  })

  it('ports the landing page mark as three uneven fanned shapes', () => {
    const slots = createStaticFamilyMarkSlots()
    expect(slots).toHaveLength(3)
    expect(slots[1].cx).toBeCloseTo(FAMILY_MARK_VIEW_BOX_SIZE / 2, 3)
    expect(slots[1].height).toBeGreaterThan(slots[0].height)
    expect(slots[2].height).toBeGreaterThan(slots[0].height)
    expect(slots.map((slot) => slot.rotation)).toEqual([-14, 0, 12])
  })

  it('draws a closed organic silhouette rather than a rectangle', () => {
    const path = familyMarkPetalPath({ cx: 32, cy: 32, width: 10, height: 30, rotation: 0 })
    expect(path.startsWith('M ')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path.match(/A /g)).toHaveLength(3)
  })
})

import { describe, expect, it } from 'vitest'
import {
  createFamilyMarkModel,
  createFamilyMarkSlots,
  familyMarkPetalBounds,
  FAMILY_MARK_VIEW_BOX_SIZE,
  orderedFamilyMarkMembers,
} from './familyMark'

const members = Array.from({ length: 8 }, (_, index) => ({
  id: `member-${String.fromCharCode(104 - index)}`,
  color_key: index % 2 === 0 ? 'sky' as const : 'honey' as const,
}))

describe('family mark geometry', () => {
  it.each([1, 2, 3, 4, 5, 6])('has a deterministic layout for %i members', (count) => {
    const model = createFamilyMarkModel(members.slice(0, count))
    expect(model.visibleMembers).toHaveLength(count)
    expect(model.slots).toHaveLength(count)
    expect(model.overflowMembers).toHaveLength(0)
  })

  it('orders members by stable id rather than incoming query order', () => {
    const ordered = orderedFamilyMarkMembers(members.slice(0, 4))
    expect(ordered.map((member) => member.id)).toEqual(['member-e', 'member-f', 'member-g', 'member-h'])
  })

  it('uses five member petals and one controlled overflow petal above six members', () => {
    const model = createFamilyMarkModel(members)
    expect(model.visibleMembers.map((member) => member.id)).toEqual([
      'member-a', 'member-b', 'member-c', 'member-d', 'member-e',
    ])
    expect(model.overflowMembers.map((member) => member.id)).toEqual(['member-f', 'member-g', 'member-h'])
    expect(model.slots).toHaveLength(6)
  })

  it('returns fresh ordered arrays without mutating context data', () => {
    const input = members.slice(0, 3)
    const before = input.map((member) => member.id)
    orderedFamilyMarkMembers(input)
    expect(input.map((member) => member.id)).toEqual(before)
  })

  it.each([1, 2, 3, 4, 5, 6])('centers and contains the %i-member geometry without overlap', (count) => {
    const slots = createFamilyMarkSlots(count)
    const centerX = slots.reduce((sum, slot) => sum + slot.cx, 0) / slots.length
    const centerY = slots.reduce((sum, slot) => sum + slot.cy, 0) / slots.length
    expect(centerX).toBeCloseTo(FAMILY_MARK_VIEW_BOX_SIZE / 2, 3)
    expect(centerY).toBeCloseTo(FAMILY_MARK_VIEW_BOX_SIZE / 2, 3)

    for (const slot of slots) {
      const bounds = familyMarkPetalBounds(slot)
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(FAMILY_MARK_VIEW_BOX_SIZE)
      expect(bounds.bottom).toBeLessThanOrEqual(FAMILY_MARK_VIEW_BOX_SIZE)
    }

    for (let left = 0; left < slots.length; left++) {
      for (let right = left + 1; right < slots.length; right++) {
        const dx = slots[left].cx - slots[right].cx
        const dy = slots[left].cy - slots[right].cy
        const distance = Math.hypot(dx, dy)
        const requiredGap = (slots[left].size + slots[right].size) / Math.sqrt(2)
        expect(distance).toBeGreaterThanOrEqual(requiredGap)
      }
    }
  })
})

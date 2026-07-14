import { describe, expect, it } from 'vitest'
import { createFamilyMarkModel, orderedFamilyMarkMembers } from './familyMark'

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
})

import type { FamilyMember } from '../hooks/useFamilyMembers'

export interface FamilyMarkSlot {
  cx: number
  cy: number
  size: number
  rotation: number
}

export interface FamilyMarkModel {
  visibleMembers: Array<Pick<FamilyMember, 'id' | 'color_key'>>
  overflowMembers: Array<Pick<FamilyMember, 'id' | 'color_key'>>
  slots: FamilyMarkSlot[]
}

const LAYOUTS: Record<number, FamilyMarkSlot[]> = {
  1: [{ cx: 32, cy: 32, size: 27, rotation: 45 }],
  2: [
    { cx: 23, cy: 24, size: 23, rotation: 38 },
    { cx: 41, cy: 40, size: 23, rotation: 38 },
  ],
  3: [
    { cx: 32, cy: 18, size: 20, rotation: 42 },
    { cx: 45, cy: 40, size: 20, rotation: 48 },
    { cx: 19, cy: 40, size: 20, rotation: 38 },
  ],
  4: [
    { cx: 32, cy: 18, size: 20, rotation: 39 },
    { cx: 46, cy: 32, size: 20, rotation: 51 },
    { cx: 32, cy: 46, size: 20, rotation: 39 },
    { cx: 18, cy: 32, size: 20, rotation: 51 },
  ],
  5: [
    { cx: 32, cy: 15, size: 17, rotation: 42 },
    { cx: 48, cy: 27, size: 17, rotation: 51 },
    { cx: 42, cy: 46, size: 17, rotation: 40 },
    { cx: 22, cy: 46, size: 17, rotation: 50 },
    { cx: 16, cy: 27, size: 17, rotation: 39 },
  ],
  6: [
    { cx: 32, cy: 14, size: 15.5, rotation: 42 },
    { cx: 47.5, cy: 23, size: 15.5, rotation: 50 },
    { cx: 47.5, cy: 41, size: 15.5, rotation: 40 },
    { cx: 32, cy: 50, size: 15.5, rotation: 50 },
    { cx: 16.5, cy: 41, size: 15.5, rotation: 39 },
    { cx: 16.5, cy: 23, size: 15.5, rotation: 48 },
  ],
}

export function orderedFamilyMarkMembers<T extends Pick<FamilyMember, 'id' | 'color_key'>>(members: T[]): T[] {
  return [...members].sort((left, right) => left.id.localeCompare(right.id))
}

export function createFamilyMarkModel(
  members: Array<Pick<FamilyMember, 'id' | 'color_key'>>
): FamilyMarkModel {
  const ordered = orderedFamilyMarkMembers(members)
  const hasOverflow = ordered.length > 6
  const visibleMembers = hasOverflow ? ordered.slice(0, 5) : ordered
  const overflowMembers = hasOverflow ? ordered.slice(5) : []
  const slotCount = hasOverflow ? 6 : Math.max(1, ordered.length)

  return {
    visibleMembers,
    overflowMembers,
    slots: LAYOUTS[slotCount],
  }
}

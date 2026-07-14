import type { FamilyMember } from '../hooks/useFamilyMembers'

export const FAMILY_MARK_VIEW_BOX_SIZE = 64

export const STATIC_FAMILY_MARK_COLORS = [
  '#B94742',
  '#E96C62',
  '#97302B',
  '#F2A99F',
] as const

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

interface LayoutConfig {
  radius: number
  petalSize: number
  angleOffset: number
}

const LAYOUT_CONFIG: Record<number, LayoutConfig> = {
  1: { radius: 0, petalSize: 24, angleOffset: -90 },
  2: { radius: 12, petalSize: 16, angleOffset: 180 },
  3: { radius: 17, petalSize: 18, angleOffset: -90 },
  4: { radius: 17, petalSize: 16, angleOffset: -90 },
  5: { radius: 19, petalSize: 15, angleOffset: -90 },
  6: { radius: 20, petalSize: 13.5, angleOffset: -90 },
}

function cleanCoordinate(value: number): number {
  return Number(value.toFixed(4))
}

export function createFamilyMarkSlots(count: number): FamilyMarkSlot[] {
  const normalizedCount = Math.min(6, Math.max(1, Math.round(count)))
  const config = LAYOUT_CONFIG[normalizedCount]

  return Array.from({ length: normalizedCount }, (_, index) => {
    const angle = config.angleOffset + (360 / normalizedCount) * index
    const radians = angle * Math.PI / 180
    return {
      cx: cleanCoordinate(32 + Math.cos(radians) * config.radius),
      cy: cleanCoordinate(32 + Math.sin(radians) * config.radius),
      size: config.petalSize,
      rotation: 45,
    }
  })
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
    slots: createFamilyMarkSlots(slotCount),
  }
}

export function familyMarkPetalBounds(slot: FamilyMarkSlot) {
  const halfDiagonal = slot.size / Math.sqrt(2)
  return {
    left: slot.cx - halfDiagonal,
    right: slot.cx + halfDiagonal,
    top: slot.cy - halfDiagonal,
    bottom: slot.cy + halfDiagonal,
  }
}

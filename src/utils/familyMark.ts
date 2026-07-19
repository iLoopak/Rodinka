import type { FamilyMember, MemberRole } from '../hooks/useFamilyMembers'

export const FAMILY_MARK_VIEW_BOX_SIZE = 64

// The landing page's stable mark is three vertical organic shapes — coral,
// honey, mint — of uneven height, fanned very slightly outward. The app's
// mark is the same shape language made dynamic: one shape per family member.
export const STATIC_FAMILY_MARK_COLORS = [
  '#e9785e',
  '#f2c85b',
  '#8bc6ad',
] as const

export interface FamilyMarkSlot {
  cx: number
  cy: number
  width: number
  height: number
  rotation: number
}

export interface FamilyMarkModel {
  members: Array<Pick<FamilyMember, 'id' | 'color_key' | 'custom_color'> & { role?: MemberRole }>
  slots: FamilyMarkSlot[]
}

// Layout budget inside the 64×64 box. Shapes shrink toward MIN_WIDTH as the
// family grows and only start overlapping once they hit that floor, so a big
// family compacts gracefully instead of widening the header.
const AVAILABLE_WIDTH = 54
// Shapes stop thinning here and start overlapping instead: a big family should
// read as an overlapping group, never as a comb of matchsticks.
const MIN_WIDTH = 9.5
const MAX_WIDTH = 15.5
const STEP_RATIO = 1.16
const MIN_HEIGHT = 28
const MAX_HEIGHT = 42
const HEIGHT_RATIO = 2.6
const EDGE_SHORTENING = 0.24
const MAX_LEAN = 13

// Fixed, deterministic height nudges so a row of shapes never reads as a
// mechanically symmetric chart. Indexed by position, never random.
const HEIGHT_WOBBLE = [0, 0.04, -0.03, 0.02, -0.04, 0.03, -0.02, 0.05]

const ROLE_HEIGHT: Record<MemberRole, number> = {
  admin: 1.06,
  parent: 1.06,
  child: 0.9,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function cleanCoordinate(value: number): number {
  return Number(value.toFixed(4))
}

export function createFamilyMarkSlots(
  count: number,
  roles: Array<MemberRole | null | undefined> = []
): FamilyMarkSlot[] {
  const total = Math.max(1, Math.round(count))
  const idealWidth = AVAILABLE_WIDTH / (1 + (total - 1) * STEP_RATIO)
  const width = clamp(idealWidth, MIN_WIDTH, MAX_WIDTH)
  const step = total > 1
    ? Math.min(width * STEP_RATIO, (AVAILABLE_WIDTH - width) / (total - 1))
    : 0
  const tallest = clamp(width * HEIGHT_RATIO, MIN_HEIGHT, MAX_HEIGHT)
  const rowWidth = width + step * (total - 1)
  const firstCx = FAMILY_MARK_VIEW_BOX_SIZE / 2 - rowWidth / 2 + width / 2
  const center = (total - 1) / 2
  const spread = center || 1

  return Array.from({ length: total }, (_, index) => {
    const offset = (index - center) / spread
    const role = roles[index]
    const height = tallest
      * (1 - EDGE_SHORTENING * Math.abs(offset))
      * (role ? ROLE_HEIGHT[role] : 1)
      * (1 + HEIGHT_WOBBLE[index % HEIGHT_WOBBLE.length])

    return {
      cx: cleanCoordinate(firstCx + step * index),
      cy: FAMILY_MARK_VIEW_BOX_SIZE / 2,
      width: cleanCoordinate(width),
      height: cleanCoordinate(clamp(height, tallest * 0.6, MAX_HEIGHT)),
      rotation: cleanCoordinate(MAX_LEAN * offset),
    }
  })
}

// A scaled port of the landing page's own three-shape mark, kept exact rather
// than regenerated so the stable and dynamic variants read as one logo family.
export function createStaticFamilyMarkSlots(): FamilyMarkSlot[] {
  const scale = 1.355
  const widths = [11, 12, 11].map((value) => value * scale)
  const heights = [18, 27, 21].map((value) => value * scale)
  const rotations = [-14, 0, 12]
  const gap = 2 * scale
  const rowWidth = widths.reduce((sum, value) => sum + value, 0) + gap * 2
  let cursor = FAMILY_MARK_VIEW_BOX_SIZE / 2 - rowWidth / 2

  return widths.map((width, index) => {
    const cx = cursor + width / 2
    cursor += width + gap
    return {
      cx: cleanCoordinate(cx),
      cy: FAMILY_MARK_VIEW_BOX_SIZE / 2,
      width: cleanCoordinate(width),
      height: cleanCoordinate(heights[index]),
      rotation: rotations[index],
    }
  })
}

export function orderedFamilyMarkMembers<T extends Pick<FamilyMember, 'id'>>(members: T[]): T[] {
  return [...members].sort((left, right) => left.id.localeCompare(right.id))
}

export function createFamilyMarkModel(
  members: Array<Pick<FamilyMember, 'id' | 'color_key' | 'custom_color'> & { role?: MemberRole }>
): FamilyMarkModel {
  const ordered = orderedFamilyMarkMembers(members)
  return {
    members: ordered,
    slots: createFamilyMarkSlots(Math.max(1, ordered.length), ordered.map((member) => member.role)),
  }
}

// The SVG equivalent of the landing mark's `border-radius: 50% 50% 45% 45%`:
// a half-ellipse over the top, large rounded corners and a short flat base.
export function familyMarkPetalPath(slot: FamilyMarkSlot): string {
  const halfWidth = slot.width / 2
  const halfHeight = slot.height / 2
  const left = -halfWidth
  const right = halfWidth
  const bottom = halfHeight
  const cornerX = slot.width * 0.45
  const cornerY = slot.height * 0.45
  const round = (value: number) => Number(value.toFixed(3))

  return [
    `M ${round(left)} 0`,
    `A ${round(halfWidth)} ${round(halfHeight)} 0 0 1 ${round(right)} 0`,
    `L ${round(right)} ${round(bottom - cornerY)}`,
    `A ${round(cornerX)} ${round(cornerY)} 0 0 1 ${round(right - cornerX)} ${round(bottom)}`,
    `L ${round(left + cornerX)} ${round(bottom)}`,
    `A ${round(cornerX)} ${round(cornerY)} 0 0 1 ${round(left)} ${round(bottom - cornerY)}`,
    'Z',
  ].join(' ')
}

export function familyMarkPetalTransform(slot: FamilyMarkSlot): string {
  return `translate(${slot.cx} ${slot.cy}) rotate(${slot.rotation})`
}

// Axis-aligned bounds of the leaning shape, used to prove the mark stays
// inside its box at every family size.
export function familyMarkPetalBounds(slot: FamilyMarkSlot) {
  const radians = Math.abs(slot.rotation) * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfWidth = (slot.width * cos + slot.height * sin) / 2
  const halfHeight = (slot.width * sin + slot.height * cos) / 2

  return {
    left: slot.cx - halfWidth,
    right: slot.cx + halfWidth,
    top: slot.cy - halfHeight,
    bottom: slot.cy + halfHeight,
  }
}

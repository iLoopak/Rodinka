import type { FamilyJumpCosmeticSlot } from './cosmeticTypes'

export interface CosmeticPoint { x: number; y: number }
export interface CosmeticAnchors {
  headAnchor: CosmeticPoint
  faceAnchor: CosmeticPoint
  neckAnchor: CosmeticPoint
  leftFootAnchor: CosmeticPoint
  rightFootAnchor: CosmeticPoint
}

export function cosmeticAnchors(width: number, height: number): CosmeticAnchors {
  return {
    headAnchor: { x: 0, y: -height / 2 },
    faceAnchor: { x: 0, y: -height * 0.13 },
    neckAnchor: { x: 0, y: height * 0.2 },
    leftFootAnchor: { x: -width * 0.22, y: height / 2 + 4 },
    rightFootAnchor: { x: width * 0.22, y: height / 2 + 4 },
  }
}

export function anchorForSlot(anchors: CosmeticAnchors, slot: FamilyJumpCosmeticSlot) {
  if (slot === 'head') return anchors.headAnchor
  if (slot === 'face') return anchors.faceAnchor
  if (slot === 'neck') return anchors.neckAnchor
  return anchors.leftFootAnchor
}

